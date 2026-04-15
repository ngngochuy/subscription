# Subscription Service

A simple subscription application with automated deploy pipelines via GitHub Actions.

## Auto Deploy Setup

This project uses **GitHub Actions** for CI/CD to automatically deploy code to a VPS via FTP whenever code is pushed to the `main` branch.

### Prerequisites

You must configure the following **Secrets** in this repository's settings (`Settings` > `Secrets and variables` > `Actions`):

- `FTP_SERVER`: The FTP server address or IP of your VPS.
- `FTP_USERNAME`: Your FTP account username.
- `FTP_PASSWORD`: Your FTP account password.

## Auto Push Usage

You can use the provided script to quickly commit and push your changes:
```bash
./push.sh
```

Or just use standard git commands:
```bash
git add .
git commit -m "Your update message"
git push origin main
```
