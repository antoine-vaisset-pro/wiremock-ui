import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { StubsPageComponent } from './pages/stubs/stubs-page.component';
import { RequestsPageComponent } from './pages/requests/requests-page.component';
import { RequesterPageComponent } from './pages/requester/requester-page.component';
import { RecordingPageComponent } from './pages/recording/recording-page.component';
import { ScenariosPageComponent } from './pages/scenarios/scenarios-page.component';
import { SettingsPageComponent } from './pages/settings/settings-page.component';
import { HelpPageComponent } from './pages/help/help-page.component';
import { OpenApiGeneratorPageComponent } from './pages/openapi-generator/openapi-generator-page.component';
export const routes: Routes = [
  { path: '', redirectTo: '/ui/dashboard', pathMatch: 'full' },
  { path: 'ui/dashboard', component: DashboardPageComponent },
  { path: 'ui/stubs', component: StubsPageComponent },
  { path: 'ui/stubs/:id', component: StubsPageComponent },
  { path: 'ui/scenarios', component: ScenariosPageComponent },
  { path: 'ui/requests', component: RequestsPageComponent },
  { path: 'ui/requests/:id', component: RequestsPageComponent },
  { path: 'ui/requester', component: RequesterPageComponent },
  { path: 'ui/recording', component: RecordingPageComponent },
  { path: 'ui/generator', component: OpenApiGeneratorPageComponent },
  { path: 'ui/settings', component: SettingsPageComponent },
  { path: 'ui/help', component: HelpPageComponent },
  { path: '**', redirectTo: '/ui/dashboard' }
];
