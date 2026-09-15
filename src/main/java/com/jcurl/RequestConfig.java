package com.jcurl;

import java.util.*;

public class RequestConfig {

    public enum Method { GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS }

    private String url;
    private Method method = Method.GET;
    private final List<String[]> headers = new ArrayList<>();
    private String body;
    private byte[] bodyBytes;
    private final List<MultipartField> multipartFields = new ArrayList<>();
    private String outputFile;
    private boolean useRemoteFileName;
    private boolean verbose;
    private boolean includeHeaders;
    private boolean headOnly;
    private boolean followRedirects = false;
    private boolean insecure;
    private boolean silent;
    private boolean jsonBody;
    private String userAgent;
    private String basicAuth;
    private String cookieString;
    private String cookieFile;
    private int connectTimeout = 10;
    private int maxTime = 0;
    private String writeFormat;

    public static class MultipartField {
        public final String name;
        public final String value;
        public final String filePath;

        public MultipartField(String name, String value, String filePath) {
            this.name = name;
            this.value = value;
            this.filePath = filePath;
        }
    }

    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }

    public Method getMethod() { return method; }
    public void setMethod(Method method) { this.method = method; }

    public List<String[]> getHeaders() { return headers; }
    public void addHeader(String key, String value) { headers.add(new String[]{key, value}); }

    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }

    public byte[] getBodyBytes() { return bodyBytes; }
    public void setBodyBytes(byte[] bodyBytes) { this.bodyBytes = bodyBytes; }

    public List<MultipartField> getMultipartFields() { return multipartFields; }
    public void addMultipartField(String name, String value, String filePath) {
        multipartFields.add(new MultipartField(name, value, filePath));
    }

    public String getOutputFile() { return outputFile; }
    public void setOutputFile(String outputFile) { this.outputFile = outputFile; }

    public boolean isUseRemoteFileName() { return useRemoteFileName; }
    public void setUseRemoteFileName(boolean useRemoteFileName) { this.useRemoteFileName = useRemoteFileName; }

    public boolean isVerbose() { return verbose; }
    public void setVerbose(boolean verbose) { this.verbose = verbose; }

    public boolean isIncludeHeaders() { return includeHeaders; }
    public void setIncludeHeaders(boolean includeHeaders) { this.includeHeaders = includeHeaders; }

    public boolean isHeadOnly() { return headOnly; }
    public void setHeadOnly(boolean headOnly) { this.headOnly = headOnly; }

    public boolean isFollowRedirects() { return followRedirects; }
    public void setFollowRedirects(boolean followRedirects) { this.followRedirects = followRedirects; }

    public boolean isInsecure() { return insecure; }
    public void setInsecure(boolean insecure) { this.insecure = insecure; }

    public boolean isSilent() { return silent; }
    public void setSilent(boolean silent) { this.silent = silent; }

    public boolean isJsonBody() { return jsonBody; }
    public void setJsonBody(boolean jsonBody) { this.jsonBody = jsonBody; }

    public String getUserAgent() { return userAgent; }
    public void setUserAgent(String userAgent) { this.userAgent = userAgent; }

    public String getBasicAuth() { return basicAuth; }
    public void setBasicAuth(String basicAuth) { this.basicAuth = basicAuth; }

    public String getCookieString() { return cookieString; }
    public void setCookieString(String cookieString) { this.cookieString = cookieString; }

    public String getCookieFile() { return cookieFile; }
    public void setCookieFile(String cookieFile) { this.cookieFile = cookieFile; }

    public int getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(int connectTimeout) { this.connectTimeout = connectTimeout; }

    public int getMaxTime() { return maxTime; }
    public void setMaxTime(int maxTime) { this.maxTime = maxTime; }

    public String getWriteFormat() { return writeFormat; }
    public void setWriteFormat(String writeFormat) { this.writeFormat = writeFormat; }

    public String getEffectiveMethod() {
        if (headOnly) return "HEAD";
        return method.name();
    }
}
