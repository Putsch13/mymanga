import { NextResponse } from "next/server";

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized", message: "Connexion requise." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}
