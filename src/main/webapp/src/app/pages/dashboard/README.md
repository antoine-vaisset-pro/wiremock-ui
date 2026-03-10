# Dashboard
Dashboard component providing a comprehensive overview of the WireMock state and key real-time statistics.
## Features
### Key metrics (KPIs)
- **Active Stubs**: Total number of configured stubs
- **Total Requests**: Total number of received requests
- **Unmatched Requests**: Unmatched requests (error indicator)
- Auto-refresh every 30 seconds
### Charts
#### Requests per hour chart
- Displays requests over the last 24 hours
- Interactive bar chart
- Automatic update every 30 seconds
#### Top 5 endpoints
- List of the 5 most called endpoints
- Display of HTTP method and URL
#### Unused Stubs
- Identification of stubs never called
- Helps clean up obsolete stubs
- Success message if all stubs are used
### System Information
The component is loaded automatically at application startup (default view).
Accessible via the "Dashboard" button in the side menu.
## Auto-refresh
- Automatic deactivation when the component is destroyed
- Manual refresh button available
## APIs Used
- `GET /__admin/mappings` - List of stubs
- `GET /__admin/requests` - List of requests
- `GET /__admin/requests/unmatched` - Unmatched requests
- `GET /__admin` - System information
## Architecture
- `dashboard-page.component.ts` - Main component
- `dashboard.service.ts` - Service for data retrieval and transformation
### Dependencies
- `@angular/common` - Standard Angular directives
- `rxjs` - Reactive data management
- `highcharts` - Chart library
## Responsive
The component is fully responsive:
- Grid layout adapts to screen width
## States
### Loading
Display of a spinner during initial data loading.
### Error
Error message with retry button if loading fails.
## Customization
### Changing the refresh interval
Modify the `REFRESH_INTERVAL` constant in `dashboard-page.component.ts`.
### Colors
Colors are defined via CSS variables in `styles.css`:
- Primary: `#6366f1`
- Success: `#22c55e`
- Warning: `#f59e0b`
- Error: `#ef4444`
## Performance
- Use of `forkJoin` to parallelize API calls
- Error handling per endpoint (one failure does not impact others)
- Chart optimization with `[hidden]` instead of `*ngIf` to keep the component in memory
- Auto-refresh stops on error to avoid overloading in case of network issue
## Future Improvements
- [ ] Customizable time period filters
- [ ] Export statistics as CSV/PDF
- [ ] Configurable alerts for unmatched requests
- [ ] More advanced charts (curves, pie charts)
- [ ] Period comparison
- [ ] WebSocket for true real-time updates
