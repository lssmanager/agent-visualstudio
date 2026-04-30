// Tipos de request body para settings de providers.
// Sin class-validator — validación manual en el controller.
export interface PatchProviderKeyBody {
  apiKey: string
}
