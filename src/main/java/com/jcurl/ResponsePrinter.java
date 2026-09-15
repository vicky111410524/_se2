package com.jcurl;

import java.io.PrintStream;

public class ResponsePrinter {

    public static void printVerboseInfo(CurlClient client, RequestConfig config, PrintStream out) {
        if (!config.isVerbose()) return;

        String method = config.getEffectiveMethod();
        String url = config.getUrl();

        out.println("* Trying " + extractHost(url) + "...");
        out.println("* Connected to " + extractHost(url) + " port " + extractPort(url));
        if (client.getConnectTime() > 0) {
            out.println("* Connection time: " + String.format("%.3f", client.getConnectTime() / 1000.0) + "s");
        }
        if (client.getDnsTime() > 0) {
            out.println("* DNS lookup time: " + String.format("%.3f", client.getDnsTime() / 1000.0) + "s");
        }
        out.println("> " + method + " " + getPath(url) + " HTTP/1.1");
        out.println("> Host: " + extractHost(url));

        for (String[] h : config.getHeaders()) {
            out.println("> " + h[0] + ": " + h[1]);
        }

        if (config.getUserAgent() != null) {
            out.println("> User-Agent: " + config.getUserAgent());
        }
        if (config.getBasicAuth() != null) {
            out.println("> Authorization: Basic [hidden]");
        }
        out.println("> Accept: */*");
        out.println();
    }

    public static void printTimingStats(CurlClient client, RequestConfig config, PrintStream out) {
        if (config.isSilent() && config.getWriteFormat() == null) return;

        if (!config.isVerbose()) {
            return;
        }

        out.println();
        out.println("* Connection time: " + String.format("%.3f", client.getConnectTime() / 1000.0) + "s");
        out.println("* Time to first byte: " + String.format("%.3f", client.getFirstByteTime() / 1000.0) + "s");
        out.println("* Total time: " + String.format("%.3f", client.getTotalTime() / 1000.0) + "s");
        out.println("* Download size: " + client.getSizeDownload() + " bytes");
    }

    private static String extractHost(String url) {
        try {
            return new java.net.URL(url).getHost();
        } catch (Exception e) {
            return "unknown";
        }
    }

    private static int extractPort(String url) {
        try {
            java.net.URL u = new java.net.URL(url);
            int port = u.getPort();
            if (port != -1) return port;
            return u.getProtocol().equals("https") ? 443 : 80;
        } catch (Exception e) {
            return 80;
        }
    }

    private static String getPath(String url) {
        try {
            java.net.URL u = new java.net.URL(url);
            String path = u.getPath();
            if (path == null || path.isEmpty()) path = "/";
            if (u.getQuery() != null) path += "?" + u.getQuery();
            return path;
        } catch (Exception e) {
            return "/";
        }
    }
}
