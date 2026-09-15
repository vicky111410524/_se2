package com.jcurl;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

public class CommandLineParser {

    public static RequestConfig parse(String[] args) {
        if (args.length == 0) {
            printUsageAndExit();
        }

        RequestConfig config = new RequestConfig();
        int i = 0;

        while (i < args.length) {
            String arg = args[i];

            if (!arg.startsWith("-")) {
                config.setUrl(arg);
                i++;
                continue;
            }

            switch (arg) {
                case "-X":
                    i++;
                    if (i >= args.length) error("-X requires a method");
                    config.setMethod(RequestConfig.Method.valueOf(args[i].toUpperCase()));
                    break;

                case "-H":
                    i++;
                    if (i >= args.length) error("-H requires \"Name: Value\"");
                    parseHeader(config, args[i]);
                    break;

                case "-d":
                case "--data":
                case "--data-raw":
                    i++;
                    if (i >= args.length) error(arg + " requires a value");
                    if (config.getMethod() == RequestConfig.Method.GET)
                        config.setMethod(RequestConfig.Method.POST);
                    config.setBody(args[i]);
                    break;

                case "--data-binary":
                    i++;
                    if (i >= args.length) error("--data-binary requires a value");
                    if (config.getMethod() == RequestConfig.Method.GET)
                        config.setMethod(RequestConfig.Method.POST);
                    config.setBodyBytes(args[i].getBytes());
                    break;

                case "-j":
                case "--json":
                    i++;
                    if (i >= args.length) error(arg + " requires a JSON value");
                    if (config.getMethod() == RequestConfig.Method.GET)
                        config.setMethod(RequestConfig.Method.POST);
                    config.setBody(args[i]);
                    config.setJsonBody(true);
                    break;

                case "-F":
                case "--form":
                    i++;
                    if (i >= args.length) error("-F requires \"name=value\" or \"name=@file\"");
                    parseMultipart(config, args[i]);
                    if (config.getMethod() == RequestConfig.Method.GET)
                        config.setMethod(RequestConfig.Method.POST);
                    break;

                case "-o":
                    i++;
                    if (i >= args.length) error("-o requires a filename");
                    config.setOutputFile(args[i]);
                    break;

                case "-O":
                    config.setUseRemoteFileName(true);
                    break;

                case "-v":
                case "--verbose":
                    config.setVerbose(true);
                    break;

                case "-i":
                    config.setIncludeHeaders(true);
                    break;

                case "-I":
                case "--head":
                    config.setHeadOnly(true);
                    break;

                case "-L":
                case "--location":
                    config.setFollowRedirects(true);
                    break;

                case "--no-location":
                    config.setFollowRedirects(false);
                    break;

                case "-k":
                case "--insecure":
                    config.setInsecure(true);
                    break;

                case "-s":
                case "--silent":
                    config.setSilent(true);
                    break;

                case "-A":
                case "--user-agent":
                    i++;
                    if (i >= args.length) error("-A requires a user-agent string");
                    config.setUserAgent(args[i]);
                    break;

                case "-u":
                case "--user":
                    i++;
                    if (i >= args.length) error("-u requires user:password");
                    config.setBasicAuth(args[i]);
                    break;

                case "-b":
                case "--cookie":
                    i++;
                    if (i >= args.length) error("-b requires cookie string or file");
                    if (args[i].contains("=")) {
                        config.setCookieString(args[i]);
                    } else {
                        config.setCookieFile(args[i]);
                    }
                    break;

                case "--connect-timeout":
                    i++;
                    if (i >= args.length) error("--connect-timeout requires seconds");
                    config.setConnectTimeout(Integer.parseInt(args[i]));
                    break;

                case "-m":
                case "--max-time":
                    i++;
                    if (i >= args.length) error("-m requires seconds");
                    config.setMaxTime(Integer.parseInt(args[i]));
                    break;

                case "-w":
                case "--write-out":
                    i++;
                    if (i >= args.length) error("-w requires a format string");
                    config.setWriteFormat(args[i]);
                    break;

                case "--help":
                    printUsageAndExit();
                    break;

                case "--version":
                    System.out.println("jcurl 1.0.0");
                    System.exit(0);
                    break;

                default:
                    error("Unknown option: " + arg);
            }
            i++;
        }

        if (config.getUrl() == null) {
            error("No URL provided");
        }

        if (!config.getUrl().startsWith("http://") && !config.getUrl().startsWith("https://")) {
            config.setUrl("http://" + config.getUrl());
        }

        return config;
    }

    private static void parseHeader(RequestConfig config, String header) {
        int colonIndex = header.indexOf(':');
        if (colonIndex < 0) {
            error("Invalid header format: " + header + " (expected \"Name: Value\")");
        }
        String key = header.substring(0, colonIndex).trim();
        String value = header.substring(colonIndex + 1).trim();
        config.addHeader(key, value);
    }

    private static void parseMultipart(RequestConfig config, String field) {
        if (field.startsWith("@")) {
            config.addMultipartField(null, null, field.substring(1));
        } else {
            int eqIndex = field.indexOf('=');
            if (eqIndex < 0) {
                error("Invalid -F format: " + field + " (expected \"name=value\" or \"name=@file\")");
            }
            String name = field.substring(0, eqIndex);
            String value = field.substring(eqIndex + 1);
            if (value.startsWith("@")) {
                config.addMultipartField(name, null, value.substring(1));
            } else {
                config.addMultipartField(name, value, null);
            }
        }
    }

    private static void printUsageAndExit() {
        System.out.println("Usage: jcurl [options...] <URL>");
        System.out.println();
        System.out.println("Options:");
        System.out.println("  -X <method>          HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)");
        System.out.println("  -H \"Name: Value\"     Add custom header (repeatable)");
        System.out.println("  -d <data>            Send request body data");
        System.out.println("  --data-raw <data>    Send body data (raw, no processing)");
        System.out.println("  --data-binary <data> Send body data as binary");
        System.out.println("  -j, --json <json>    Send JSON body (auto Content-Type)");
        System.out.println("  -F, --form <field>   Send multipart form data (name=@file or name=value)");
        System.out.println("  -o <file>            Write output to file");
        System.out.println("  -O                   Write output to file using remote filename");
        System.out.println("  -v, --verbose        Show request/response headers");
        System.out.println("  -i                   Include response headers in output");
        System.out.println("  -I, --head           Use HEAD method");
        System.out.println("  -L, --location       Follow redirects");
        System.out.println("  --no-location        Don't follow redirects");
        System.out.println("  -k, --insecure       Skip SSL certificate verification");
        System.out.println("  -s, --silent         Silent mode");
        System.out.println("  -A, --user-agent <s> Set User-Agent string");
        System.out.println("  -u, --user <u:p>     HTTP Basic authentication");
        System.out.println("  -b, --cookie <s>     Send cookies (string or file)");
        System.out.println("  --connect-timeout <s> Connection timeout in seconds (default: 10)");
        System.out.println("  -m, --max-time <s>   Maximum request time in seconds");
        System.out.println("  -w, --write-out <f>  Custom output format");
        System.out.println("  --help               Show this help");
        System.out.println();
        System.out.println("Examples:");
        System.out.println("  jcurl https://httpbin.org/get");
        System.out.println("  jcurl -X POST -j '{\"name\":\"test\"}' https://httpbin.org/post");
        System.out.println("  jcurl -v -H \"Authorization: Bearer token\" https://api.example.com");
        System.out.println("  jcurl -L -o result.html https://example.com");
        System.out.println("  jcurl -F \"file=@./photo.jpg\" https://upload.example.com");
        System.exit(1);
    }

    private static void error(String message) {
        System.err.println("jcurl: " + message);
        System.exit(1);
    }
}
