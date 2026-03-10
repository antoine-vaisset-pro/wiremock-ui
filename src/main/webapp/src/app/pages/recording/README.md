# Recording Studio
The **Recording Studio** screen allows you to automatically record WireMock stubs from a real API. It is a powerful tool for QA engineers who want to quickly create mocks without writing code.
## Main features
### 1. Real-time status
- Displays the current recording status (recording, stopped, never started)
- Automatic refresh every 5 seconds
### 2. Basic configuration
- **Target URL** (required): The base URL of the real API to record
- **Persist**: Save generated stubs permanently to disk
- **Handle repetitions as scenarios**: Create WireMock scenarios for repeated calls
#### Advanced configuration
- **URL pattern filter**: Regex pattern to filter which URLs are captured
  - HTTP Method: Filter by GET, POST, PUT, PATCH, DELETE
  - Example: `/api/users/.*`
  - Request headers to capture (comma-separated)
### 3. Actions
- **▶️ Start recording**: Starts recording with the current configuration
- **📸 Snapshot**: Takes a snapshot of stubs without stopping the recording
- **⏹️ Stop**: Stops the recording and retrieves all stubs
- **💾 Save**: Saves the current configuration for reuse
- **📁 Load**: Loads a previously saved configuration
- **🗑️ Delete**: Deletes a saved configuration
### 4. Recording results
After stopping the recording or taking a snapshot:
- Displays all recorded stubs as a grid
- Colored badge for each HTTP method
- Detailed view when clicking on a stub
- **📥 Export all**: Downloads all mappings as a single JSON file
## Usage scenarios
### Scenario 1: Simple recording
1. Go to the **Recording** screen from the menu
2. Enter the target URL (e.g., `http://my-api.example.com`)
3. Optionally check **Persist**
4. Click **▶️ Start recording**
5. Make calls to your WireMock (which will proxy to the real API)
6. Click **⏹️ Stop recording**
7. Check the stubs created in the results section
### Scenario 2: Recording with filters
1. Open **Advanced configuration**
2. Define a URL pattern: `/api/users/.*`
3. Select a method: `GET`
4. Add headers to capture: `Authorization, X-API-Key`
5. Start recording
6. Only GET requests to `/api/users/*` will be recorded
### Scenario 3: Continuous snapshot
Useful for capturing stubs incrementally without stopping the recording:
1. Start recording normally
2. Make some calls
3. Click **📸 Snapshot** to save the current stubs
4. Continue making other calls
5. Take more snapshots as needed
6. Stop the recording when done
### Scenario 4: Configuration reuse
To avoid reconfiguring every time:
1. Configure the recording as usual
2. Click **💾 Save** and enter a name
3. The configuration is saved in localStorage
4. Next time, click **📁 Load**
5. Select the configuration and click **📂 Load**
## WireMock APIs used
| Endpoint | Method | Description |
|---|---|---|
| `/__admin/recordings/start` | POST | Starts a recording |
| `/__admin/recordings/stop` | POST | Stops the recording |
| `/__admin/recordings/status` | GET | Retrieves the current status |
## Persistence
Saved configurations are stored in the browser **localStorage** under the key `wiremock-recording-configs`. They persist between sessions but are tied to the browser used.
## Best practices
1. **Test with persist=false first** to verify stubs before saving them permanently
2. **Use filters** to avoid capturing too many unnecessary stubs
3. **Take regular snapshots** if doing a long recording
4. **Export your mappings** to save or share them with the team
5. **Save your configurations** for recurring scenarios
## Known limitations
- The target API must be accessible from the WireMock server
- Sensitive headers (e.g. session cookies) may be captured
- Generated stubs may need manual adjustment
## Possible future improvements
- Grouping of stubs by endpoint
- Editing stubs before saving
- Real-time preview during recording
- Configurable polling delay
