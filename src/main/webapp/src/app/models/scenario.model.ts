export interface Scenario {
  id: string;
  name: string;
  state: string;
  possibleStates: string[];
}

export interface ScenariosResponse {
  scenarios: Scenario[];
}

export interface ScenarioStateUpdate {
  state: string;
}

