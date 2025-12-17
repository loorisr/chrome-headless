# Headless chrome docker

## Features
- based on Alpine and Node LTS
- lightweight: 886 mo vs 3.09 go for browserless

## Usage with Playwright
```
browser = p.chromium.connect_over_cdp(f"ws://127.0.0.1:9222/chrome")
```
or
```
browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:9222")
```

