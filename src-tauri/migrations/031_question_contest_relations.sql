CREATE TABLE question_contest_relations (
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    contest_id TEXT NOT NULL REFERENCES manual_contests(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK (
        relation_type IN ('official_exam', 'previous_exam', 'thematic_compatibility')
    ),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (question_id, contest_id)
);

CREATE INDEX idx_question_contest_relations_contest
    ON question_contest_relations(contest_id, relation_type, question_id);
