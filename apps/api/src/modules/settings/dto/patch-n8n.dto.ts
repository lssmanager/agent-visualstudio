// Tipos de request body para settings de n8n.
// Sin class-validator — validación manual en el controller.
export interface PatchN8nBody {
  baseUrl: string
  apiKey:  string
}
