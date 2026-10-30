#!/usr/bin/env python3
"""Records a REAL interactive bash session (in a pty) with the guard hook active and renders it to PNG.
Usage: python3 docs/screenshots/capture_hook.py [bash|zsh]   (run from the project root after `npm run build`)"""
import os, pty, re, select, shutil, subprocess, sys, tempfile, time, json
shell = sys.argv[1] if len(sys.argv) > 1 else "bash"
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
tmp = tempfile.mkdtemp(prefix="guardshot-")
home, gh, prot, work = (os.path.join(tmp, d) for d in ("home", "ghome", "protected", "work"))
for d in (home, gh, prot, work): os.makedirs(d)
open(os.path.join(prot, "customers.db"), "w").write("keep")
os.makedirs(os.path.join(work, "build")); open(os.path.join(work, "build", "app.js"), "w").write("x")
json.dump({"version": 1, "environment": {"protectedDirectories": [prot]}}, open(os.path.join(gh, "config.json"), "w"))
env = {"PATH": os.environ["PATH"], "HOME": home, "GUARD_HOME": gh, "GUARD_CLI": root + "/dist/cli.js",
       "GUARD_NODE": shutil.which("node"), "TERM": "dumb", "FORCE_COLOR": "1"}
argv = ["bash", "--norc", "--noprofile", "-i"] if shell == "bash" else ["zsh", "-f", "-i"]
pid, fd = pty.fork()
if pid == 0:
    os.chdir(work); os.execvpe(argv[0], argv, env)
buf = ""
def rd(t):
    global buf
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try: buf += os.read(fd, 4096).decode("utf-8", "replace")
            except OSError: return
def send(s, wait=3.0): os.write(fd, (s + "\n").encode()); rd(wait)
rd(1.5)
send("PS1='\\[\\e[32m\\]you@laptop\\[\\e[0m\\]$ '" if shell == "bash" else "PROMPT='%F{green}you@laptop%f$ '", 0.8)
send("source %s/integrations/%s/guard.%s" % (root, shell, shell), 0.8)
buf = ""
send("echo hello from a harmless command", 1.5)
send("rm -rf %s/customers.db" % prot, 6)
send("rm -rf build", 6)
send("n", 1.5)
send("ls build", 1.5)
send("rm -rf build", 6)
send("y", 2.5)
send("ls build", 1.5)
os.write(fd, b"exit\n"); rd(0.5)
text = buf.replace("\r\n", "\n").replace("\r", "")
text = re.sub(r"\x1b\[\?2004[hl]", "", text).replace(tmp, "/tmp/demo")
# the pty redraws the prompt after each command; keep only the prompt that precedes typed input
text = re.sub(r"(\x1b\[32myou@laptop\x1b\[0m\$) {10,}", "", text)
text = "\x1b[32myou@laptop\x1b[0m$ " + text.rstrip().removesuffix("exit").rstrip() + "\n"
out = os.path.join(root, "docs", "screenshots", "11-%s-hook-session.ans" % shell)
open(out, "w").write(text)
subprocess.run([sys.executable, os.path.join(root, "scripts", "render_terminal.py"), out, out.replace(".ans", ".png"), "Interactive %s with the guard hook (real session)" % shell])
shutil.rmtree(tmp, ignore_errors=True)
