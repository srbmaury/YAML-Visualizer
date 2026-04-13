# CI/CD Guide

This document explains the GitHub Actions workflows and CI/CD pipeline for the YAML Data Visualizer project.

## 📋 Table of Contents

- [Overview](#overview)
- [Workflows](#workflows)
- [Local Testing](#local-testing)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## 🎯 Overview

Our CI/CD pipeline ensures code quality, security, and reliability through automated testing and validation. All workflows are defined in `.github/workflows/`.

## 🔄 Workflows

### 1. CI Pipeline (`ci.yml`)

**Triggers:** Push to main/develop/refactoring branches, Pull requests

**Jobs:**

#### Backend Tests & Checks
- Runs on Node.js 18.x and 20.x
- Executes Jest test suite
- Generates code coverage reports
- Uploads coverage to Codecov

```bash
# Run locally
cd server
npm test
npm run test:coverage
```

#### Frontend Checks
- Runs ESLint for code quality
- Validates production build
- Reports build size

```bash
# Run locally
cd client
npm run lint
npm run build
```

#### Dependency Audit
- Scans for security vulnerabilities
- Checks both backend and frontend dependencies
- Reports high/critical vulnerabilities

```bash
# Run locally
npm audit --audit-level=moderate
```

#### View Tracking Tests
- Tests ViewLog deduplication system
- Requires MongoDB running
- Validates unique view tracking

```bash
# Run locally (requires MongoDB)
cd server
node src/tests/viewlog.test.js
```

#### All Checks Passed
- Summary job that depends on all other jobs
- Only passes if all checks succeed
- Provides clear success/failure status

---

### 2. Pull Request Checks (`pr-checks.yml`)

**Triggers:** Pull request opened/synchronized/reopened

**Features:**

#### PR Information
- Counts changed files (backend/frontend)
- Calculates PR size (additions/deletions)
- Warns on large PRs (>1000 lines)

#### Code Quality
- Detects `console.log` statements
- Finds TODO/FIXME comments
- Scans for potential secrets in code
- **Fails if secrets detected**

#### Test Summary
- Runs backend tests
- Reports pass/fail statistics
- Outputs detailed results

#### PR Comment
- Posts automated summary comment
- Lists all checks performed
- Provides quick overview

---

### 3. Nightly Checks (`nightly.yml`)

**Triggers:** Daily at 2 AM UTC, Manual trigger via workflow_dispatch

**Jobs:**

#### Comprehensive Backend Tests
- Runs full test suite with coverage
- Executes ViewLog tests
- Archives test results as artifacts

#### Dependency Updates
- Checks for outdated packages
- Reports available updates
- Helps maintain current dependencies

#### Security Scan
- Advanced scanning with Trivy
- Uploads results to GitHub Security
- Detects vulnerabilities in dependencies

#### Health Checks
- Validates import statements
- Tests frontend build
- Ensures application integrity

---

### 4. CodeQL Security (`codeql.yml`)

**Triggers:** Push to main/develop, Pull requests, Weekly on Monday at 3 AM

**Analysis:**
- JavaScript/TypeScript code scanning
- Security and quality queries
- Vulnerability detection
- Integration with GitHub Security tab

---

## 🔧 Local Testing

Before pushing code, run these checks locally:

### Backend Checks
```bash
cd server

# Install dependencies
npm ci

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run ViewLog tests (requires MongoDB)
export MONGODB_URI=mongodb://localhost:27017/yaml-visualizer-test
node src/tests/viewlog.test.js

# Security audit
npm audit
```

### Frontend Checks
```bash
cd client

# Install dependencies
npm ci

# Lint code
npm run lint

# Build for production
npm run build

# Security audit
npm audit
```

### Combined Checks
```bash
# From project root

# Check for secrets
grep -rE "(api[_-]?key|password|secret|token)['\"]?\s*[:=]" server/src client/src --exclude-dir=node_modules

# Check for console.log
grep -r "console\.log" client/src --exclude-dir=node_modules

# Check for TODOs
grep -r "TODO\|FIXME\|XXX\|HACK" server/src client/src --exclude-dir=node_modules
```

---

## 🚨 Troubleshooting

### Common Issues

#### Tests Failing Locally but Passing in CI
- Ensure you're using the correct Node version (18.x or 20.x)
- Check that all dependencies are installed (`npm ci`)
- Verify environment variables are set correctly

#### Frontend Build Fails
- Clear node_modules and package-lock.json
- Reinstall dependencies: `rm -rf node_modules package-lock.json && npm install`
- Check for TypeScript errors

#### View Tracking Tests Fail
- Ensure MongoDB is running locally
- Check MONGODB_URI environment variable
- Verify database connectivity

#### Security Audit Warnings
- Review npm audit output
- Update vulnerable packages when possible
- For false positives, document the exception

### Viewing Workflow Logs

1. Go to the **Actions** tab in GitHub
2. Click on the workflow run
3. Select the specific job
4. View detailed logs for each step

### Re-running Failed Workflows

1. Navigate to the failed workflow
2. Click **Re-run jobs** → **Re-run failed jobs**
3. Monitor the run for success

---

## ✅ Best Practices

### Before Committing

1. **Run tests locally**
   ```bash
   cd server && npm test
   ```

2. **Lint your code**
   ```bash
   cd client && npm run lint
   ```

3. **Check for secrets**
   - Never commit API keys, passwords, or tokens
   - Use `.env` files (excluded from git)
   - Review diffs before pushing

### Pull Request Guidelines

1. **Keep PRs small**
   - Aim for < 500 lines changed
   - Split large features into multiple PRs

2. **Write descriptive titles**
   - Good: "Add view deduplication to ViewLog model"
   - Bad: "Update files"

3. **Wait for CI checks**
   - All checks must pass before merging
   - Address any failures promptly

4. **Review PR comments**
   - Check automated PR comment for summary
   - Review any warnings or suggestions

### Dependency Management

1. **Update regularly**
   - Review Dependabot PRs weekly
   - Test updates thoroughly before merging

2. **Audit security**
   - Run `npm audit` before major releases
   - Address high/critical vulnerabilities immediately

3. **Lock file maintenance**
   - Commit package-lock.json changes
   - Use `npm ci` in CI for reproducible builds

### Code Quality

1. **Remove debug code**
   - No `console.log` in production code
   - Use proper logging libraries

2. **Address TODOs**
   - Complete TODOs before merging
   - Or create issues for future work

3. **Test coverage**
   - Aim for >80% coverage
   - Write tests for new features

---

## 📊 Monitoring

### GitHub Actions Dashboard

Monitor all workflows: [Actions Tab](https://github.com/srbmaury-team/Data-Visualizer/actions)

### Status Badges

Add these to your README:

```markdown
[![CI](https://github.com/srbmaury-team/Data-Visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/srbmaury-team/Data-Visualizer/actions/workflows/ci.yml)
[![CodeQL](https://github.com/srbmaury-team/Data-Visualizer/actions/workflows/codeql.yml/badge.svg)](https://github.com/srbmaury-team/Data-Visualizer/actions/workflows/codeql.yml)
```

### Notifications

Configure GitHub notifications for:
- Failed workflow runs
- Security alerts
- Dependabot PRs

---

## 🔐 Security

### Branch Protection Rules

Recommended settings for `main` branch:

- ✅ Require pull request reviews (1 approver)
- ✅ Require status checks to pass:
  - Backend tests
  - Frontend checks
  - Security audit
  - View tracking tests
- ✅ Require branches to be up to date
- ✅ Require conversation resolution
- ✅ Require signed commits (optional)
- ✅ Include administrators

### Secrets Management

**Never commit:**
- API keys
- Database passwords
- JWT secrets
- OAuth tokens
- Private keys

**Use GitHub Secrets for:**
- MONGODB_URI (if needed for CI)
- CODECOV_TOKEN
- Any deployment credentials

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Jest Testing Framework](https://jestjs.io/)
- [ESLint Configuration](https://eslint.org/)
- [Codecov Documentation](https://docs.codecov.com/)
- [Dependabot Configuration](https://docs.github.com/en/code-security/dependabot)

---

## 🤝 Contributing

When contributing to CI/CD configuration:

1. Test workflow changes on a fork first
2. Document new workflows in this guide
3. Update README badges if adding new workflows
4. Ensure backwards compatibility
5. Get review from maintainers

---

**Last Updated:** April 2026  
**Maintainers:** @srbmaury-team
