#!/usr/bin/env python3
"""Interactive hook test: runs a REAL bash/zsh inside a pseudo-terminal and types commands into it.
Usage: pty_hook_test.py bash|zsh
Only disposable files under a temp dir are touched."""
import os, pty, select, shutil, subprocess, sys, tempfile, time, json

shell = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
cli = os.path.join(root, "dist", "cli.js")
node = shutil.which("node")
tmp = tempfile.mkdtemp(prefix="guardpty-")
home = os.path.join(tmp, "home"); os.makedirs(home)
ghome = os.path.join(tmp, "ghome"); os.makedirs(ghome)
prot = os.path.join(tmp, "protected"); os.makedirs(prot)
scratch = os.path.join(tmp, "scratch"); os.makedirs(scratch)
open(os.path.join(prot, "data.txt"), "w").write("keep me")
open(os.path.join(scratch, "f.txt"), "w").write("x")
json.dump({"version": 1, "environment": {"protectedDirectories": [prot]}}, open(os.path.join(ghome, "config.json"), "w"))

script = os.path.join(root, "integrations", shell, "guard." + shell)
env = {"PATH": os.environ["PATH"], "HOME": home, "GUARD_HOME": ghome, "GUARD_CLI": cli, "GUARD_NODE": node,
       "NO_COLOR": "1", "TERM": "dumb", "PS1": "READY> ", "PROMPT": "READY> "}
argv = ["bash", "--norc", "--noprofile", "-i"] if shell == "bash" else ["zsh", "-f", "-i"]
pid, fd = pty.fork()
if pid == 0:
    os.execvpe(argv[0], argv, env)

buf = ""
def read_until(markers, timeout=15):
    global buf
    end = time.time() + timeout
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try:
                data = os.read(fd, 4096).decode("utf-8", "replace")
            except OSError:
                break
            buf += data
            if any(m in buf for m in markers):
                return True
    return False

def send(line):
    os.write(fd, (line + "\n").encode())

fails = []
def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)
        if os.environ.get("PTY_DEBUG"):
            print("---- terminal output at failure ----\n" + buf + "\n------------------------------------")

read_until(["READY> "])
# the prompt string differs per shell; set it explicitly
send("PS1='READY> '; PROMPT='READY> '" if shell == "bash" else "PROMPT='READY> '")
read_until(["READY> "]); buf = ""
send("source '%s'" % script); read_until(["READY> "]); buf = ""

send("echo hello-from-shell"); ok = read_until(["hello-from-shell\r\nREADY"]); 
check("%s: harmless command runs" % shell, "hello-from-shell" in buf)
buf = ""

send("rm -rf '%s'" % os.path.join(prot, "data.txt")); read_until(["READY> "], 20)
check("%s: protected target is BLOCKED" % shell, os.path.exists(os.path.join(prot, "data.txt")) and "FS_PROTECTED_TARGET" in buf)
buf = ""

send("rm -rf '%s'" % scratch); read_until(["Continue?"], 20)
asked = "Continue?" in buf
send("n"); read_until(["READY> "], 20)
check("%s: CONFIRM asks, 'n' cancels (dir kept)" % shell, asked and os.path.exists(scratch))
buf = ""

send("rm -rf '%s'" % scratch); read_until(["Continue?"], 20)
send("y"); read_until(["READY> "], 20); time.sleep(0.3)
check("%s: CONFIRM then 'y' runs (dir removed)" % shell, not os.path.exists(scratch))
buf = ""

send("echo after-everything"); read_until(["after-everything\r\nREADY"])
check("%s: shell still usable afterwards" % shell, "after-everything" in buf)

os.write(fd, b"exit\n")
try: os.waitpid(pid, 0)
except Exception: pass
shutil.rmtree(tmp, ignore_errors=True)
print("RESULT:", "ALL PASSED" if not fails else "FAILED: %s" % fails)
sys.exit(1 if fails else 0)
