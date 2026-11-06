import { onRequestGet as __api_info_js_onRequestGet } from "C:\\Users\\abc45\\OneDrive\\Desktop\\vicky\\html2server\\_se2\\HW9\\functions\\api\\info.js"
import { onRequestOptions as __api_info_js_onRequestOptions } from "C:\\Users\\abc45\\OneDrive\\Desktop\\vicky\\html2server\\_se2\\HW9\\functions\\api\\info.js"
import { onRequest as __api_info_js_onRequest } from "C:\\Users\\abc45\\OneDrive\\Desktop\\vicky\\html2server\\_se2\\HW9\\functions\\api\\info.js"

export const routes = [
    {
      routePath: "/api/info",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_info_js_onRequestGet],
    },
  {
      routePath: "/api/info",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_info_js_onRequestOptions],
    },
  {
      routePath: "/api/info",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_info_js_onRequest],
    },
  ]