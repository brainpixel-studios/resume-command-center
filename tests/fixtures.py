"""Synthetic resume-shaped data for pagination tests. Contains NO real career data.

These fixtures are independent, self-contained synthetic test data and are committed
as-is — they are not derived from, and do not stand in for, any real resume export.
"""

LOREM = (
    "Delivered measurable outcomes across a portfolio of initiatives, coordinating "
    "stakeholders and vendors to close complex agreements ahead of schedule"
)


def make_bullet(i, text=None):
    return {
        "id": f"b_test_{i}",
        "active": 0,
        "variants": [{"text": text or f"{LOREM} (item {i}).", "label": "Default"}],
    }


def make_position(pi, n_bullets, title=None, dates="2020 – 2024"):
    return {
        "title": title or f"Test Title {pi}",
        "dates": dates,
        "bullets": [make_bullet(f"{pi}_{b}") for b in range(n_bullets)],
    }


def make_role(ri, n_bullets, n_positions=1):
    return {
        "id": f"role_test_{ri}",
        "company": f"Test Company {ri}",
        "location": "Somewhere, TX",
        "positions": [make_position(f"{ri}_{p}", n_bullets) for p in range(n_positions)],
    }


def make_resume(n_roles=3, n_bullets_per_pos=4, n_positions=1):
    """Build a complete resume-shaped payload with no PII."""
    return {
        "header": {
            "name": "Test Person",
            "location": "Somewhere, TX",
            "phone": "555-0100",
            "email": "test@example.com",
        },
        "summary": {
            "active": 0,
            "variants": [{"text": f"{LOREM}. {LOREM}.", "label": "Default"}],
        },
        "jobTarget": {"role": "", "company": "", "description": "", "keywords": []},
        "roles": [make_role(r, n_bullets_per_pos, n_positions) for r in range(n_roles)],
        "achievements": [
            {"id": f"a_{i}", "active": 0, "variants": [{"text": f"{LOREM} ({i}).", "label": "Default"}]}
            for i in range(3)
        ],
        "competencyGroups": [
            {
                "id": "cg_0",
                "label": "Test Group",
                "items": [{"id": f"ci_{i}", "text": f"Competency {i}", "active": True} for i in range(6)],
            }
        ],
        "education": [
            {"id": "e_0", "school": "Test University", "location": "Somewhere, TX", "degree": "B.S. Testing"}
        ],
    }
