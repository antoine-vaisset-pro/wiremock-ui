import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';

export interface RecordingStatus {
  status: 'NeverStarted' | 'Recording' | 'Stopped';
}

export interface RecordingConfig {
  targetBaseUrl: string;
  filters?: {
    urlPathPattern?: string;
    method?: string;
    headers?: { [key: string]: any };
  };
  captureHeaders?: { [key: string]: any };
  requestBodyPattern?: {
    matcher?: string;
    ignoreArrayOrder?: boolean;
    ignoreExtraElements?: boolean;
  };
  extractBodyCriteria?: {
    textSizeThreshold?: string;
    binarySizeThreshold?: string;
  };
  persist?: boolean;
  repeatsAsScenarios?: boolean;
  transformers?: string[];
  transformerParameters?: { [key: string]: any };
}

export interface SnapshotConfig {
  filters?: {
    urlPathPattern?: string;
    method?: string;
    ids?: string[];
  };
  captureHeaders?: { [key: string]: any };
  requestBodyPattern?: {
    matcher?: string;
    ignoreArrayOrder?: boolean;
    ignoreExtraElements?: boolean;
  };
  extractBodyCriteria?: {
    textSizeThreshold?: string;
    binarySizeThreshold?: string;
  };
  outputFormat?: 'FULL' | 'MINIMAL';
  persist?: boolean;
  repeatsAsScenarios?: boolean;
}

export interface RecordingResult {
  mappings: any[];
}

@Injectable({
  providedIn: 'root'
})
export class RecordingService {
  private get baseUrl(): string {
    return this.configService.wiremockApiUrl;
  }

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  /**
   * Starts a new recording with the provided configuration
   */
  startRecording(config: RecordingConfig): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/recordings/start`, config);
  }

  /**
   * Stops the current recording and returns the recorded stubs
   */
  stopRecording(): Observable<RecordingResult> {
    return this.http.post<RecordingResult>(`${this.baseUrl}/recordings/stop`, {});
  }

  /**
   * Retrieves the current recording status
   */
  getRecordingStatus(): Observable<RecordingStatus> {
    return this.http.get<RecordingStatus>(`${this.baseUrl}/recordings/status`);
  }

  /**
   * Takes a snapshot of recordings without stopping the recording
   */
  takeSnapshot(config?: SnapshotConfig): Observable<RecordingResult> {
    return this.http.post<RecordingResult>(
      `${this.baseUrl}/recordings/snapshot`,
      config || {}
    );
  }
}

