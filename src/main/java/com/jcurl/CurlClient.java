package com.jcurl;

import javax.net.ssl.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.X509Certificate;
import java.util.*;

public class CurlClient {

    private final RequestConfig config;
    private final List<String[]> responseHeaders = new ArrayList<>();
    private int responseCode;
    private String responseMessage;
    private long totalTime;
    private long dnsTime;
    private long connectTime;
    private long tlsTime;
    private long firstByteTime;
    private long sizeDownload;
    private byte[] responseBody = new byte[0];
    private String currentUrl;

    public CurlClient(RequestConfig config) {
        this.config = config;
    }

    public int execute() throws Exception {
        long startTime = System.currentTimeMillis();
        String method = config.getEffectiveMethod();
        String url = config.getUrl();
        currentUrl = url;
        int redirectCount = 0;
        int maxRedirects = 50;

        while (true) {
            HttpURLConnection conn = openConnection(url);
            conn.setRequestMethod(method);
            conn.setInstanceFollowRedirects(false);
            if (methodHasBody(method)) {
                conn.setDoOutput(true);
            }
            applyConfig(conn);

            long dnsStart = System.currentTimeMillis();
            long connectStart, reqStart;

            try {
                connectStart = System.currentTimeMillis();
                conn.connect();
                connectTime = System.currentTimeMillis() - connectStart;
                dnsTime = connectStart - dnsStart;

                reqStart = System.currentTimeMillis();
                if (methodHasBody(method)) {
                    try (OutputStream os = conn.getOutputStream()) {
                        if (isMultipart()) {
                            String boundary = getBoundaryFromContentType(
                                    conn.getRequestProperty("Content-Type"));
                            os.write(buildMultipartBody(boundary));
                        } else if (config.getBody() != null) {
                            os.write(config.getBody().getBytes(StandardCharsets.UTF_8));
                        } else if (config.getBodyBytes() != null) {
                            os.write(config.getBodyBytes());
                        }
                        os.flush();
                    }
                }

                responseCode = conn.getResponseCode();
                responseMessage = conn.getResponseMessage();
                firstByteTime = System.currentTimeMillis() - reqStart;

                responseHeaders.clear();
                Map<String, List<String>> hdrs = conn.getHeaderFields();
                for (Map.Entry<String, List<String>> entry : hdrs.entrySet()) {
                    if (entry.getKey() != null) {
                        for (String val : entry.getValue()) {
                            responseHeaders.add(new String[]{entry.getKey(), val});
                        }
                    }
                }

                if (config.isFollowRedirects() && isRedirect(responseCode)) {
                    String location = conn.getHeaderField("Location");
                    if (location == null) {
                        break;
                    }
                    if (!location.startsWith("http")) {
                        URL base = new URL(url);
                        location = new URL(base, location).toString();
                    }
                    redirectCount++;
                    if (redirectCount > maxRedirects) {
                        System.err.println("jcurl: too many redirects (" + redirectCount + ")");
                        return responseCode;
                    }
                    if (!config.isSilent()) {
                        System.err.println("< redirect to " + location);
                    }
                    conn.disconnect();
                    url = location;
                    currentUrl = location;
                    if (responseCode == 301 || responseCode == 302 || responseCode == 303) {
                        method = "GET";
                    }
                    continue;
                }

                readResponseBody(conn);
                conn.disconnect();
                break;
            } catch (IOException e) {
                conn.disconnect();
                throw e;
            }
        }

        totalTime = System.currentTimeMillis() - startTime;
        return responseCode;
    }

    private void readResponseBody(HttpURLConnection conn) throws IOException {
        InputStream stream;
        if (responseCode >= 400) {
            stream = conn.getErrorStream();
        } else {
            stream = conn.getInputStream();
        }
        if (stream == null) {
            responseBody = new byte[0];
            sizeDownload = 0;
            return;
        }
        try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
             InputStream in = stream) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                bos.write(buffer, 0, read);
            }
            responseBody = bos.toByteArray();
        }
        sizeDownload = responseBody.length;
    }

    public void printResponseHeaders(PrintStream out) {
        boolean showHeaders = config.isVerbose() || config.isIncludeHeaders();
        if (!showHeaders) return;
        out.println("< HTTP/1.1 " + responseCode + " " + responseMessage);
        for (String[] h : responseHeaders) {
            out.println("< " + h[0] + ": " + h[1]);
        }
        out.println();
    }

    public void printResponse(PrintStream out) {
        boolean showHeaders = config.isVerbose() || config.isIncludeHeaders();

        if (showHeaders) {
            out.println("< HTTP/1.1 " + responseCode + " " + responseMessage);
            for (String[] h : responseHeaders) {
                out.println("< " + h[0] + ": " + h[1]);
            }
        }

        if (config.isHeadOnly()) {
            return;
        }

        try {
            out.write(responseBody);
        } catch (IOException e) {
            System.err.println("jcurl: error writing response: " + e.getMessage());
        }
    }

    public void writeOutput() throws IOException {
        if (config.getOutputFile() == null && !config.isUseRemoteFileName()) {
            return;
        }

        String fileName = config.getOutputFile();
        if (config.isUseRemoteFileName()) {
            fileName = extractFileName(currentUrl);
            if (fileName == null || fileName.isEmpty()) {
                fileName = "index.html";
            }
        }

        try (OutputStream os = new FileOutputStream(fileName)) {
            os.write(responseBody);
        }

        if (!config.isSilent()) {
            System.err.println("jcurl: saved to " + fileName);
        }
    }

    public void printWriteOut(PrintStream out) {
        if (config.getWriteFormat() == null) return;
        String fmt = config.getWriteFormat();
        fmt = fmt.replace("%{http_code}", String.valueOf(responseCode));
        fmt = fmt.replace("%{time_total}", String.format("%.3f", totalTime / 1000.0));
        fmt = fmt.replace("%{time_connect}", String.format("%.3f", connectTime / 1000.0));
        fmt = fmt.replace("%{time_namelookup}", String.format("%.3f", dnsTime / 1000.0));
        fmt = fmt.replace("%{time_starttransfer}", String.format("%.3f", firstByteTime / 1000.0));
        fmt = fmt.replace("%{size_download}", String.valueOf(sizeDownload));
        fmt = fmt.replace("%{url_effective}", currentUrl);
        fmt = fmt.replace("%{remote_ip}", extractHost(currentUrl));
        fmt = fmt.replace("\\n", "\n");
        fmt = fmt.replace("\\t", "\t");
        out.print(fmt);
    }

    private void applyConfig(HttpURLConnection conn) throws Exception {
        if (conn instanceof HttpsURLConnection && config.isInsecure()) {
            HttpsURLConnection https = (HttpsURLConnection) conn;
            https.setSSLSocketFactory(createInsecureSSLContext().getSocketFactory());
            https.setHostnameVerifier((h, s) -> true);
        }

        conn.setConnectTimeout(config.getConnectTimeout() * 1000);
        conn.setReadTimeout(config.getMaxTime() > 0 ? config.getMaxTime() * 1000 : 300000);

        conn.setRequestProperty("User-Agent",
                config.getUserAgent() != null ? config.getUserAgent() : "JCurl/1.0");
        conn.setRequestProperty("Accept", "*/*");

        boolean hasBody = config.getBody() != null || config.getBodyBytes() != null;
        boolean hasMultipart = !config.getMultipartFields().isEmpty();

        if (hasMultipart) {
            String boundary = "----JCurlBoundary" + System.currentTimeMillis();
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            conn.setRequestProperty("Content-Length", String.valueOf(buildMultipartBody(boundary).length));
        } else if (config.isJsonBody()) {
            conn.setRequestProperty("Content-Type", "application/json");
        } else if (hasBody && !config.isHeadOnly()) {
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        }

        for (String[] h : config.getHeaders()) {
            conn.setRequestProperty(h[0], h[1]);
        }

        if (config.getBasicAuth() != null) {
            String encoded = Base64.getEncoder().encodeToString(
                    config.getBasicAuth().getBytes(StandardCharsets.UTF_8));
            conn.setRequestProperty("Authorization", "Basic " + encoded);
        }

        String cookieHeader = buildCookieHeader();
        if (cookieHeader != null) {
            conn.setRequestProperty("Cookie", cookieHeader);
        }
    }

    private byte[] buildMultipartBody(String boundary) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        String CRLF = "\r\n";
        for (RequestConfig.MultipartField field : config.getMultipartFields()) {
            try {
                String header = "--" + boundary + CRLF;
                if (field.filePath != null) {
                    String fileName = new File(field.filePath).getName();
                    String name = field.name != null ? field.name : "file";
                    header += "Content-Disposition: form-data; name=\"" + name
                            + "\"; filename=\"" + fileName + "\"" + CRLF;
                    String contentType = guessContentType(fileName);
                    header += "Content-Type: " + contentType + CRLF + CRLF;
                    bos.write(header.getBytes(StandardCharsets.UTF_8));
                    byte[] fileBytes = Files.readAllBytes(Paths.get(field.filePath));
                    bos.write(fileBytes);
                    bos.write(CRLF.getBytes(StandardCharsets.UTF_8));
                } else {
                    String name = field.name;
                    header += "Content-Disposition: form-data; name=\"" + name + "\"" + CRLF + CRLF;
                    bos.write(header.getBytes(StandardCharsets.UTF_8));
                    bos.write(field.value.getBytes(StandardCharsets.UTF_8));
                    bos.write(CRLF.getBytes(StandardCharsets.UTF_8));
                }
            } catch (IOException e) {
                System.err.println("jcurl: cannot read multipart file: " + field.filePath);
            }
        }
        try {
            bos.write(("--" + boundary + "--" + CRLF).getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
        }
        return bos.toByteArray();
    }

    private String guessContentType(String fileName) {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        return "application/octet-stream";
    }

    private String buildCookieHeader() {
        List<String> cookies = new ArrayList<>();
        if (config.getCookieString() != null) {
            cookies.add(config.getCookieString());
        }
        if (config.getCookieFile() != null) {
            try {
                String content = new String(Files.readAllBytes(Paths.get(config.getCookieFile())));
                for (String line : content.split("[\r\n]+")) {
                    line = line.trim();
                    if (!line.isEmpty() && !line.startsWith("#")) {
                        cookies.add(line);
                    }
                }
            } catch (IOException e) {
                System.err.println("jcurl: cannot read cookie file: " + config.getCookieFile());
            }
        }
        return cookies.isEmpty() ? null : String.join("; ", cookies);
    }

    private HttpURLConnection openConnection(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        return (HttpURLConnection) url.openConnection();
    }

    private SSLContext createInsecureSSLContext() throws NoSuchAlgorithmException, KeyManagementException {
        TrustManager[] trustAll = new TrustManager[]{
                new X509TrustManager() {
                    public X509Certificate[] getAcceptedIssuers() { return null; }
                    public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                    public void checkServerTrusted(X509Certificate[] certs, String authType) {}
                }
        };
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, trustAll, new java.security.SecureRandom());
        return ctx;
    }

    private boolean isRedirect(int code) {
        return code == 301 || code == 302 || code == 303 || code == 307 || code == 308;
    }

    private boolean methodHasBody(String method) {
        return method.equals("POST") || method.equals("PUT") || method.equals("PATCH")
                || method.equals("DELETE");
    }

    private boolean isMultipart() {
        return !config.getMultipartFields().isEmpty();
    }

    private String getBoundaryFromContentType(String contentType) {
        if (contentType != null) {
            for (String part : contentType.split(";")) {
                part = part.trim();
                if (part.startsWith("boundary=")) {
                    return part.substring("boundary=".length());
                }
            }
        }
        return "----JCurlBoundary" + System.currentTimeMillis();
    }

    private String extractFileName(String url) {
        try {
            String path = new URL(url).getPath();
            if (path == null || path.isEmpty() || path.equals("/")) return null;
            String name = path.substring(path.lastIndexOf('/') + 1);
            int q = name.indexOf('?');
            if (q >= 0) name = name.substring(0, q);
            return URLDecoder.decode(name, "UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    private String extractHost(String url) {
        try {
            return new URL(url).getHost();
        } catch (Exception e) {
            return "unknown";
        }
    }

    public List<String[]> getResponseHeaders() { return responseHeaders; }
    public int getResponseCode() { return responseCode; }
    public String getResponseMessage() { return responseMessage; }
    public long getTotalTime() { return totalTime; }
    public long getDnsTime() { return dnsTime; }
    public long getConnectTime() { return connectTime; }
    public long getFirstByteTime() { return firstByteTime; }
    public long getSizeDownload() { return sizeDownload; }
    public String getCurrentUrl() { return currentUrl; }
}