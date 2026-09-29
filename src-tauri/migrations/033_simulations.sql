CREATE TABLE simulations (
    id TEXT PRIMARY KEY NOT NULL,
    preparation_id TEXT NOT NULL REFERENCES preparations(id),
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
    mode TEXT NOT NULL CHECK (mode IN ('training', 'exam')),
    question_count INTEGER NOT NULL CHECK (question_count > 0),
    time_limit_seconds INTEGER CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
    negative_points REAL NOT NULL DEFAULT 0 CHECK (negative_points >= 0 AND negative_points <= 10),
    blank_points REAL NOT NULL DEFAULT 0 CHECK (blank_points >= 0 AND blank_points <= 10),
    annulled_points REAL NOT NULL DEFAULT 0 CHECK (annulled_points >= 0 AND annulled_points <= 10),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'in_progress', 'paused', 'completed')),
    started_at TEXT,
    ends_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE simulation_questions (
    simulation_id TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id),
    position INTEGER NOT NULL CHECK (position >= 0),
    subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
    subject_name TEXT,
    question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false')),
    statement_markdown TEXT NOT NULL,
    options_json TEXT NOT NULL,
    answer_key_snapshot TEXT,
    status_snapshot TEXT NOT NULL CHECK (
        status_snapshot IN ('active', 'annulled', 'outdated', 'answer_changed')
    ),
    explanation_markdown TEXT,
    weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 10),
    PRIMARY KEY (simulation_id, question_id),
    UNIQUE (simulation_id, position)
);

CREATE TABLE simulation_answers (
    simulation_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    selected_key TEXT,
    elapsed_seconds INTEGER NOT NULL CHECK (elapsed_seconds >= 0),
    result TEXT NOT NULL CHECK (result IN ('correct', 'incorrect', 'blank', 'pending', 'annulled')),
    answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (simulation_id, question_id),
    FOREIGN KEY (simulation_id, question_id)
        REFERENCES simulation_questions(simulation_id, question_id) ON DELETE CASCADE
);

CREATE TABLE simulation_results (
    simulation_id TEXT PRIMARY KEY NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    score REAL NOT NULL,
    max_score REAL NOT NULL CHECK (max_score >= 0),
    percentage REAL,
    correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
    incorrect_count INTEGER NOT NULL CHECK (incorrect_count >= 0),
    blank_count INTEGER NOT NULL CHECK (blank_count >= 0),
    annulled_count INTEGER NOT NULL CHECK (annulled_count >= 0),
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE simulation_diagnostics (
    simulation_id TEXT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    subject_id TEXT,
    subject_name TEXT,
    question_count INTEGER NOT NULL CHECK (question_count > 0),
    correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
    incorrect_count INTEGER NOT NULL CHECK (incorrect_count >= 0),
    blank_count INTEGER NOT NULL CHECK (blank_count >= 0),
    elapsed_seconds INTEGER NOT NULL CHECK (elapsed_seconds >= 0),
    score REAL NOT NULL,
    PRIMARY KEY (simulation_id, subject_id)
);

CREATE INDEX idx_simulations_preparation_status
    ON simulations (preparation_id, status, created_at DESC);

CREATE INDEX idx_simulation_questions_question
    ON simulation_questions (question_id, simulation_id);
