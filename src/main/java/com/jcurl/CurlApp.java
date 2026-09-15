package com.jcurl;

import java.io.PrintStream;

public class CurlApp {

    public static void main(String[] args) {
        RequestConfig config = CommandLineParser.parse(args);
        PrintStream out = System.out;

        CurlClient client = new CurlClient(config);

        try {
            ResponsePrinter.printVerboseInfo(client, config, System.err);

            int statusCode = client.execute();

            if (config.getWriteFormat() != null) {
                client.printResponseHeaders(System.err);
                client.printWriteOut(out);
            } else if (config.getOutputFile() != null || config.isUseRemoteFileName()) {
                client.printResponseHeaders(System.err);
                client.writeOutput();
            } else {
                client.printResponse(out);
            }

            ResponsePrinter.printTimingStats(client, config, System.err);

            if (statusCode >= 400 && !config.isSilent()) {
                System.exit(statusCode > 255 ? 255 : statusCode);
            }

        } catch (Exception e) {
            if (!config.isSilent()) {
                System.err.println("jcurl: " + e.getMessage());
            }
            System.exit(1);
        }
    }
}