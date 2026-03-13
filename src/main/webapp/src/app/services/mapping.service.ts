import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {map, Observable} from 'rxjs';
import {MappingsResponse} from '../models/stub-mapping.model';
import {ConfigService} from './config.service';

@Injectable({
  providedIn: 'root'
})
export class MappingService {
  private get apiUrl(): string {
    return `${this.configService.wiremockApiUrl}/mappings`;
  }

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  getMappings(page = 0, size = 20, search = ''): Observable<MappingsResponse> {
    // The standard WireMock API returns all mappings, pagination is done client-side
    return this.http.get<any>(this.apiUrl).pipe(
      map(response => {
        let mappings = response.mappings || [];

        // Filter by search if needed
        if (search) {
          const searchLower = search.toLowerCase();
          mappings = mappings.filter((mapping: any) => {
            const json = JSON.stringify(mapping).toLowerCase();
            return json.includes(searchLower) ||
              mapping.request?.url?.toLowerCase().includes(searchLower) ||
              mapping.request?.urlPattern?.toLowerCase().includes(searchLower) ||
              mapping.request?.method?.toLowerCase().includes(searchLower) ||
              mapping.name?.toLowerCase().includes(searchLower);
          });
        }

        // Client-side pagination
        const total = mappings.length;
        const totalPages = Math.ceil(total / size);
        const start = page * size;
        const end = Math.min(start + size, total);
        const paginatedMappings = mappings.slice(start, end);

        return {
          mappings: paginatedMappings,
          meta: {
            total: total,
            page: page,
            size: size,
            totalPages: totalPages
          }
        };
      })
    );
  }

  createMapping(mapping: any): Observable<any> {
    return this.http.post(this.apiUrl, mapping);
  }

  updateMapping(uuid: string, mapping: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${uuid}`, mapping);
  }

  deleteMapping(uuid: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${uuid}`);
  }

  /**
   * Retrieves all mappings without pagination
   */
  getAllMappingsRaw(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }

  /**
   * Importe des mappings en masse
   */
  importMappings(mappings: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/import`, { mappings });
  }

  /**
   * Reset tous les mappings
   */
  resetMappings(): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset`, {});
  }
}

