"use client";

import { createContext, useContext } from "react";

/** The size (px) of the box a widget is drawn in, so it can adapt its layout. */
export type WidgetBox = { w: number; h: number };
export const BoxContext = createContext<WidgetBox>({ w: 360, h: 280 });
export const useBox = () => useContext(BoxContext);
