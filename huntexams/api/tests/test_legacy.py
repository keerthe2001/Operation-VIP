from app.main import legacy_target


def test_old_huntexams_urls_redirect() -> None:
    assert legacy_target("visual/what-is-an-api") == "/learn"
    assert legacy_target("courses/agentic-ai") == "/roadmap"
    assert legacy_target("courses/sql") == "/learn"
    assert legacy_target("blog/ats-friendly-resume-for-freshers") == "/guides"
    assert legacy_target("start") == "/signup"
    assert legacy_target("learn/rag-architecture") is None
    assert legacy_target("startup") is None
