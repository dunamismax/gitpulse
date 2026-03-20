use anyhow::Result;
use globset::{Glob, GlobSet, GlobSetBuilder};

#[derive(Debug, Clone)]
pub struct PathFilter {
    include: GlobSet,
    exclude: GlobSet,
}

impl PathFilter {
    pub fn from_patterns(include: &[String], exclude: &[String]) -> Result<Self> {
        Ok(Self { include: compile(include)?, exclude: compile(exclude)? })
    }

    pub fn allows(&self, relative_path: &str) -> bool {
        let included = self.include.is_empty() || self.include.is_match(relative_path);
        included && !self.exclude.is_match(relative_path)
    }
}

fn compile(patterns: &[String]) -> Result<GlobSet> {
    let mut builder = GlobSetBuilder::new();
    for pattern in patterns {
        builder.add(Glob::new(pattern)?);
    }
    Ok(builder.build()?)
}

#[cfg(test)]
mod tests {
    use super::PathFilter;

    #[test]
    fn excludes_generated_paths() {
        let filter =
            PathFilter::from_patterns(&[], &["target/**".into(), "**/*.lock".into()]).unwrap();
        assert!(!filter.allows("target/debug/foo"));
        assert!(!filter.allows("Cargo.lock"));
        assert!(filter.allows("src/main.rs"));
    }
}
