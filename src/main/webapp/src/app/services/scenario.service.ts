import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';
import { ScenariosResponse, ScenarioStateUpdate } from '../models/scenario.model';

@Injectable({
  providedIn: 'root'
})
export class ScenarioService {
  private get apiUrl(): string {
    return `${this.configService.wiremockApiUrl}/scenarios`;
  }

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  /**
   * Retrieves all scenarios
   */
  getAllScenarios(): Observable<ScenariosResponse> {
    return this.http.get<ScenariosResponse>(this.apiUrl);
  }

  /**
   * Resets all scenarios to the "Started" state
   */
  resetAllScenarios(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/reset`, {});
  }

  /**
   * Changes the state of a specific scenario
   */
  setScenarioState(scenarioName: string, state: string): Observable<void> {
    const body: ScenarioStateUpdate = { state };
    return this.http.put<void>(`${this.apiUrl}/${encodeURIComponent(scenarioName)}/state`, body);
  }
}

