package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func shellEscapeSingleQuoted(value string) string {
	return strings.ReplaceAll(value, "'", "'\"'\"'")
}

func powershellEscapeSingleQuoted(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func realOutputCommand(t *testing.T, output string) (string, []string) {
	t.Helper()

	if runtime.GOOS == "windows" {
		scriptPath := filepath.Join(t.TempDir(), "emit.cmd")
		lines := strings.Split(strings.TrimSuffix(output, "\n"), "\n")
		var body strings.Builder
		body.WriteString("@echo off\r\n")
		for _, line := range lines {
			body.WriteString("echo ")
			body.WriteString(line)
			body.WriteString("\r\n")
		}
		body.WriteString("exit /b 0\r\n")
		if err := os.WriteFile(scriptPath, []byte(body.String()), 0o600); err != nil {
			t.Fatalf("failed to write output script: %v", err)
		}
		return "cmd", []string{"/c", scriptPath}
	}

	scriptPath := filepath.Join(t.TempDir(), "emit.sh")
	lines := strings.Split(strings.TrimSuffix(output, "\n"), "\n")
	var body strings.Builder
	body.WriteString("#!/bin/sh\n")
	for _, line := range lines {
		body.WriteString("printf '%s\\n' '")
		body.WriteString(shellEscapeSingleQuoted(line))
		body.WriteString("'\n")
	}
	if err := os.WriteFile(scriptPath, []byte(body.String()), 0o755); err != nil {
		t.Fatalf("failed to write output script: %v", err)
	}
	return "sh", []string{scriptPath}
}

func realStdinEchoCommand(t *testing.T) (string, []string) {
	t.Helper()

	if runtime.GOOS == "windows" {
		scriptPath := filepath.Join(t.TempDir(), "stdin-echo.ps1")
		script := "$text = [Console]::In.ReadToEnd()\nif ($text.Length -gt 0) { [Console]::Out.Write($text) }\n"
		if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
			t.Fatalf("failed to write stdin echo script: %v", err)
		}
		return "powershell", []string{
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			scriptPath,
		}
	}
	return "cat", nil
}

func realSleepCommand(seconds int) (string, []string) {
	if runtime.GOOS == "windows" {
		return "powershell", []string{
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			fmt.Sprintf("Start-Sleep -Seconds %d", seconds),
		}
	}
	return "sleep", []string{fmt.Sprintf("%d", seconds)}
}

func realFailingCommand() (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd", []string{"/c", "exit 1"}
	}
	return "sh", []string{"-c", "exit 1"}
}

func configureRealCodexOutput(t *testing.T, output string) {
	t.Helper()

	command, args := realOutputCommand(t, output)
	codexCommand = command
	buildCodexArgsFn = func(cfg *Config, targetArg string) []string {
		return append([]string(nil), args...)
	}
}

func configureRealCodexStdinEcho(t *testing.T) {
	t.Helper()

	command, args := realStdinEchoCommand(t)
	codexCommand = command
	buildCodexArgsFn = func(cfg *Config, targetArg string) []string {
		return append([]string(nil), args...)
	}
}

func configureRealCodexSleep(t *testing.T, seconds int) {
	command, args := realSleepCommand(seconds)
	codexCommand = command
	buildCodexArgsFn = func(cfg *Config, targetArg string) []string {
		return append([]string(nil), args...)
	}
}

func withRealBackendOutput(t *testing.T, output string) func() {
	t.Helper()

	command, args := realOutputCommand(t, output)
	return withBackend(command, func(cfg *Config, targetArg string) []string {
		return append([]string(nil), args...)
	})
}

func withRealFailingBackend() func() {
	command, args := realFailingCommand()
	return withBackend(command, func(cfg *Config, targetArg string) []string {
		return append([]string(nil), args...)
	})
}

func portableExitError(t *testing.T) *exec.ExitError {
	t.Helper()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", "exit 3")
	} else {
		cmd = exec.Command("sh", "-c", "exit 3")
	}

	err := cmd.Run()
	exitErr, ok := err.(*exec.ExitError)
	if !ok || exitErr == nil {
		t.Fatalf("expected *exec.ExitError, got %T (%v)", err, err)
	}
	return exitErr
}

func portableStartedCommand() *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.Command("cmd", "/c", "echo ok")
	}
	return exec.Command("sh", "-c", "printf 'ok\n'")
}

func portableScriptPath(t *testing.T, basename string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		return basename + ".cmd"
	}
	return basename + ".sh"
}

func fakeCodexJSON(threadID, message string) string {
	return fmt.Sprintf("{\"type\":\"thread.started\",\"thread_id\":\"%s\"}\n{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"%s\"}}\n", threadID, message)
}
