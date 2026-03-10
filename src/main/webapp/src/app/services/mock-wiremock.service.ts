import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MockWiremockService {
  private mockMappings = [
    {
      id: 'mock-1',
      uuid: 'mock-1',
      name: 'Get Users',
      request: {
        method: 'GET',
        urlPattern: '/api/users.*'
      },
      response: {
        status: 200,
        jsonBody: { users: [] },
        headers: {
          'Content-Type': 'application/json'
        }
      },
      priority: 5
    },
    {
      id: 'mock-2',
      uuid: 'mock-2',
      name: 'Create User',
      request: {
        method: 'POST',
        url: '/api/users'
      },
      response: {
        status: 201,
        jsonBody: { id: '123', name: 'John Doe' },
        headers: {
          'Content-Type': 'application/json'
        }
      },
      priority: 5
    },
    {
      id: 'mock-3',
      uuid: 'mock-3',
      name: 'Get Products',
      request: {
        method: 'GET',
        urlPattern: '/api/products.*'
      },
      response: {
        status: 200,
        jsonBody: { products: [] },
        headers: {
          'Content-Type': 'application/json'
        }
      },
      priority: 5
    },
    {
      id: 'mock-4',
      uuid: 'mock-4',
      name: 'Delete Product',
      request: {
        method: 'DELETE',
        urlPattern: '/api/products/.*'
      },
      response: {
        status: 204
      },
      priority: 5
    },
    {
      id: 'mock-5',
      uuid: 'mock-5',
      name: 'Update User',
      request: {
        method: 'PUT',
        urlPattern: '/api/users/.*'
      },
      response: {
        status: 200,
        jsonBody: { success: true },
        headers: {
          'Content-Type': 'application/json'
        }
      },
      priority: 5
    }
  ];

  private mockRequests = [
    {
      id: 'req-1',
      request: {
        url: '/api/users',
        absoluteUrl: 'http://localhost:8080/api/users',
        method: 'GET',
        clientIp: '127.0.0.1',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Chrome/120.0'
        },
        loggedDate: Date.now() - 3600000,
        loggedDateString: new Date(Date.now() - 3600000).toISOString()
      },
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{"users":[]}'
      },
      wasMatched: true,
      stubMapping: {
        id: 'mock-1',
        uuid: 'mock-1',
        name: 'Get Users'
      }
    },
    {
      id: 'req-2',
      request: {
        url: '/api/products',
        absoluteUrl: 'http://localhost:8080/api/products',
        method: 'GET',
        clientIp: '127.0.0.1',
        headers: {
          'Accept': 'application/json'
        },
        loggedDate: Date.now() - 7200000,
        loggedDateString: new Date(Date.now() - 7200000).toISOString()
      },
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{"products":[]}'
      },
      wasMatched: true,
      stubMapping: {
        id: 'mock-3',
        uuid: 'mock-3',
        name: 'Get Products'
      }
    },
    {
      id: 'req-3',
      request: {
        url: '/api/orders',
        absoluteUrl: 'http://localhost:8080/api/orders',
        method: 'GET',
        clientIp: '127.0.0.1',
        headers: {
          'Accept': 'application/json'
        },
        loggedDate: Date.now() - 1800000,
        loggedDateString: new Date(Date.now() - 1800000).toISOString()
      },
      response: {
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{"error":"Not Found"}'
      },
      wasMatched: false
    },
    {
      id: 'req-4',
      request: {
        url: '/api/users',
        absoluteUrl: 'http://localhost:8080/api/users',
        method: 'POST',
        clientIp: '127.0.0.1',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{"name":"Jane Doe"}',
        loggedDate: Date.now() - 900000,
        loggedDateString: new Date(Date.now() - 900000).toISOString()
      },
      response: {
        status: 201,
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{"id":"123","name":"Jane Doe"}'
      },
      wasMatched: true,
      stubMapping: {
        id: 'mock-2',
        uuid: 'mock-2',
        name: 'Create User'
      }
    }
  ];

  getMappings(): Observable<any> {
    return of({
      mappings: this.mockMappings,
      meta: {
        total: this.mockMappings.length
      }
    }).pipe(delay(100));
  }

  createMapping(mapping: any): Observable<any> {
    const newMapping = {
      ...mapping,
      id: `mock-${Date.now()}`,
      uuid: `mock-${Date.now()}`
    };
    this.mockMappings.push(newMapping);
    return of(newMapping).pipe(delay(100));
  }

  updateMapping(uuid: string, mapping: any): Observable<any> {
    const index = this.mockMappings.findIndex(m => m.uuid === uuid || m.id === uuid);
    if (index !== -1) {
      this.mockMappings[index] = { ...mapping, uuid, id: uuid };
    }
    return of(this.mockMappings[index]).pipe(delay(100));
  }

  deleteMapping(uuid: string): Observable<any> {
    const index = this.mockMappings.findIndex(m => m.uuid === uuid || m.id === uuid);
    if (index !== -1) {
      this.mockMappings.splice(index, 1);
    }
    return of({}).pipe(delay(100));
  }

  getRequests(limit: number = 50, offset: number = 0): Observable<any> {
    const requests = this.mockRequests.slice(offset, offset + limit);
    return of({
      requests,
      meta: {
        total: this.mockRequests.length
      }
    }).pipe(delay(100));
  }

  getUnmatchedRequests(): Observable<any> {
    const unmatchedRequests = this.mockRequests.filter(r => !r.wasMatched);
    return of({
      requests: unmatchedRequests,
      meta: {
        total: unmatchedRequests.length
      }
    }).pipe(delay(100));
  }

  clearRequests(): Observable<any> {
    this.mockRequests.length = 0;
    return of({}).pipe(delay(100));
  }

  deleteRequest(id: string): Observable<any> {
    const index = this.mockRequests.findIndex(r => r.id === id);
    if (index !== -1) {
      this.mockRequests.splice(index, 1);
    }
    return of({}).pipe(delay(100));
  }

  getRequestById(id: string): Observable<any> {
    const request = this.mockRequests.find(r => r.id === id);
    return of(request || null).pipe(delay(100));
  }

  getNearMisses(request: any): Observable<any> {
    return of({
      nearMisses: [
        {
          request: request,
          requestPattern: {
            urlPattern: '/api/orders.*',
            method: 'GET'
          },
          stubMapping: this.mockMappings[0],
          matchResult: {
            distance: 0.15
          }
        },
        {
          request: request,
          requestPattern: {
            urlPattern: '/api/products.*',
            method: 'GET'
          },
          stubMapping: this.mockMappings[2],
          matchResult: {
            distance: 0.35
          }
        }
      ]
    }).pipe(delay(100));
  }

  getRecordingStatus(): Observable<any> {
    return of({
      status: 'NeverStarted'
    }).pipe(delay(100));
  }

  startRecording(config: any): Observable<any> {
    return of({}).pipe(delay(100));
  }

  stopRecording(): Observable<any> {
    return of({
      mappings: []
    }).pipe(delay(100));
  }

  takeSnapshot(config: any): Observable<any> {
    return of({
      mappings: []
    }).pipe(delay(100));
  }

  resetAll(): Observable<any> {
    return of({}).pipe(delay(100));
  }

  resetMappings(): Observable<any> {
    this.mockMappings.length = 0;
    return of({}).pipe(delay(100));
  }
}
