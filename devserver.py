"""Dev server with no-cache headers (testing only)."""
import http.server
import socketserver

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8430), Handler) as httpd:
    httpd.serve_forever()
