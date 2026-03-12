import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { APP_INITIALIZER, provideZoneChangeDetection } from '@angular/core';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { ConfigService } from './app/services/config.service';
import { OpenApiParserService } from './app/services/openapi-parser.service';
import {OPENAPI_PARSER_SERVICE} from "./app/services/openapi-parser.interface";

function initializeApp(configService: ConfigService) {
  return () => configService.loadConfig();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(), provideHttpClient(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [ConfigService],
      multi: true
    },
    {
      provide: OPENAPI_PARSER_SERVICE,
      useExisting: OpenApiParserService
    }
  ]
}).catch(err => console.error(err));

