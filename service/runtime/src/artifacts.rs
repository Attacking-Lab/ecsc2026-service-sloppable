use serde::Deserialize;

#[derive(Deserialize)]
pub struct ArtifactFile {
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct ArtifactManifest {
    pub files: Vec<ArtifactFile>,
}


pub fn load_manifest(artifact: &str) -> Option<ArtifactManifest> {
    let raw = std::fs::read_to_string(&format!("/artifacts/{artifact}/manifest.json")).ok()?;
    serde_json::from_str::<ArtifactManifest>(&raw).ok()
}
