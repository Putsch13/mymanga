import { NextResponse } from "next/server";

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized", message: "Connexion requise." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden", message: "Accès interdit." }, { status: 403 });
}

export function notFound() {
  return NextResponse.json({ error: "not_found", message: "Ressource introuvable." }, { status: 404 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}

export function validationError(message: string, details?: unknown) {
  return NextResponse.json({ error: "validation_error", message, details }, { status: 422 });
}

export function paymentRequired(message: string, details?: unknown) {
  return NextResponse.json({ error: "payment_required", message, details }, { status: 402 });
}
