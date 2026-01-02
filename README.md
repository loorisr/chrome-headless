# Headless chrome docker

## Features
- based on Alpine and Node LTS
- lightweight: 886 mo vs 3.09 go for browserless
- idle timeout: 24 mo RAM usage when idle

## env var
- `CHROME_TOKEN`: authorization token (default is 'chrome_token')
- `IDLE_TIMEOUT`: inactivity timeout to kill chrome (default is 60s)


## Usage with Playwright
```
browser = p.chromium.connect_over_cdp(f"ws://127.0.0.1:9222/chrome")
```
or
```
browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:9222")
```

