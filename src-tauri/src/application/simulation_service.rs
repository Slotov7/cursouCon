use crate::application::workspace_service::WorkspaceError;
use crate::domain::simulation::{
    normalize_answer_simulation_input, normalize_create_simulation_input, normalize_simulation_id,
    AnswerSimulationInput, CreateSimulationInput, SimulationDetail, SimulationResult,
    SimulationSummary,
};

pub trait SimulationStore {
    fn list_simulations(&self) -> Result<Vec<SimulationSummary>, WorkspaceError>;
    fn get_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError>;
    fn get_simulation_result(
        &self,
        simulation_id: &str,
    ) -> Result<SimulationResult, WorkspaceError>;
    fn create_simulation(
        &self,
        input: &CreateSimulationInput,
    ) -> Result<SimulationDetail, WorkspaceError>;
    fn start_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError>;
    fn pause_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError>;
    fn resume_simulation(&self, simulation_id: &str) -> Result<SimulationDetail, WorkspaceError>;
    fn answer_simulation(
        &self,
        input: &AnswerSimulationInput,
    ) -> Result<SimulationDetail, WorkspaceError>;
    fn finish_simulation(&self, simulation_id: &str) -> Result<SimulationResult, WorkspaceError>;
}

pub struct SimulationService<S> {
    store: S,
}

impl<S: SimulationStore> SimulationService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list(&self) -> Result<Vec<SimulationSummary>, WorkspaceError> {
        self.store.list_simulations()
    }

    pub fn get(&self, simulation_id: String) -> Result<SimulationDetail, WorkspaceError> {
        let simulation_id =
            normalize_simulation_id(&simulation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.get_simulation(&simulation_id)
    }

    pub fn create(&self, input: CreateSimulationInput) -> Result<SimulationDetail, WorkspaceError> {
        let normalized =
            normalize_create_simulation_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.create_simulation(&normalized)
    }

    pub fn result(&self, simulation_id: String) -> Result<SimulationResult, WorkspaceError> {
        let simulation_id =
            normalize_simulation_id(&simulation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.get_simulation_result(&simulation_id)
    }

    pub fn start(&self, simulation_id: String) -> Result<SimulationDetail, WorkspaceError> {
        let simulation_id =
            normalize_simulation_id(&simulation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.start_simulation(&simulation_id)
    }

    pub fn pause(&self, simulation_id: String) -> Result<SimulationDetail, WorkspaceError> {
        let simulation_id =
            normalize_simulation_id(&simulation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.pause_simulation(&simulation_id)
    }

    pub fn resume(&self, simulation_id: String) -> Result<SimulationDetail, WorkspaceError> {
        let simulation_id =
            normalize_simulation_id(&simulation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.resume_simulation(&simulation_id)
    }

    pub fn answer(&self, input: AnswerSimulationInput) -> Result<SimulationDetail, WorkspaceError> {
        let normalized =
            normalize_answer_simulation_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.answer_simulation(&normalized)
    }

    pub fn finish(&self, simulation_id: String) -> Result<SimulationResult, WorkspaceError> {
        let simulation_id =
            normalize_simulation_id(&simulation_id).map_err(WorkspaceError::InvalidInput)?;
        self.store.finish_simulation(&simulation_id)
    }
}
