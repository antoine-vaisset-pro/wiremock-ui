// Custom Karma configuration for Angular 21 / @angular/build:karma
//
// When `karmaConfig` is specified in angular.json the builder provides an
// empty base options object, so we must re-declare all framework settings
// (frameworks, plugins, reporters …) in addition to the custom coverage
// reporters we want for the CI pipeline report.
//
// Reference: node_modules/@angular/build/src/builders/karma/karma-config.js

const path = require('path');

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
    ],
    jasmineHtmlReporter: {
      // Removes duplicated stack traces in the browser reporter
      suppressAll: true,
    },
    coverageReporter: {
      dir: path.join(__dirname, './coverage'),
      reporters: [
        // Full HTML report – uploaded as a CI artifact and browsable locally
        { type: 'html', subdir: 'html' },
        // LCOV – standard interchange format
        { type: 'lcovonly', subdir: '.', file: 'lcov.info' },
        // JSON summary – parsed by the CI pipeline to write the job summary
        { type: 'json-summary', subdir: '.', file: 'coverage-summary.json' },
        // Human-readable summary printed to the console at the end of the run
        { type: 'text-summary' },
      ],
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['Chrome'],
    customLaunchers: {
      // Chrome configured to run in a CI / sandbox environment
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: true,
  });
};
