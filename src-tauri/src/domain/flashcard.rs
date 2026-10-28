use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Flashcard {
    pub id: String,
    pub subject_id: Option<String>,
    pub front: String,
    pub back: String,
    pub interval_days: i64,
    pub ease: i64,
    pub repetitions: i64,
    pub due_date: String,
    pub algorithm_version: i64,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

impl Rating {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Again => "again",
            Self::Hard => "hard",
            Self::Good => "good",
            Self::Easy => "easy",
        }
    }
}

pub fn next_schedule(card: &Flashcard, rating: Rating) -> (i64, i64, i64) {
    let ease = (card.ease
        + match rating {
            Rating::Again => -20,
            Rating::Hard => -15,
            Rating::Good => 0,
            Rating::Easy => 15,
        })
    .clamp(130, 300);
    let repetitions = if matches!(rating, Rating::Again) {
        0
    } else {
        card.repetitions + 1
    };
    let interval = match repetitions {
        0 | 1 => 1,
        2 => 3,
        _ => {
            let factor = match rating {
                Rating::Hard => 80,
                Rating::Easy => 130,
                _ => 100,
            };
            ((card.interval_days * ease * factor + 5000) / 10000).clamp(1, 36500)
        }
    };
    (interval, ease, repetitions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reschedules_and_resets_after_failure() {
        let mut card = Flashcard {
            id: "card".into(),
            subject_id: None,
            front: "a".into(),
            back: "b".into(),
            interval_days: 0,
            ease: 250,
            repetitions: 0,
            due_date: "2032-01-01".into(),
            algorithm_version: 1,
        };
        let (days, ease, repetitions) = next_schedule(&card, Rating::Good);
        assert_eq!((days, ease, repetitions), (1, 250, 1));
        card.interval_days = days;
        card.repetitions = repetitions;
        assert_eq!(next_schedule(&card, Rating::Good).0, 3);
        assert_eq!(next_schedule(&card, Rating::Again), (1, 230, 0));
    }
}
