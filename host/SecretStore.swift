import Foundation
import Security
import CryptoKit

// Store only the wrapping key in the login Keychain; API keys use authenticated
// encryption on disk and travel through stdin/stdout, never process arguments.
enum StoreError: Error { case failed }
func wrappingKey(create: Bool) throws -> SymmetricKey {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.sulsul.api-keys",
        kSecAttrAccount as String: "wrapping-key-v1"]
    var lookup = query
    lookup[kSecReturnData as String] = true
    var result: CFTypeRef?
    let status = SecItemCopyMatching(lookup as CFDictionary, &result)
    if status == errSecSuccess, let bytes = result as? Data, bytes.count == 32 {
        return SymmetricKey(data: bytes)
    }
    guard status == errSecItemNotFound, create else { throw StoreError.failed }
    let key = SymmetricKey(size: .bits256)
    var item = query
    item[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let added = SecItemAdd(item as CFDictionary, nil)
    if added == errSecDuplicateItem { return try wrappingKey(create: false) }
    guard added == errSecSuccess else { throw StoreError.failed }
    return key
}

do {
    guard CommandLine.arguments.count == 2 else { throw StoreError.failed }
    let mode = CommandLine.arguments[1]
    guard mode == "protect" || mode == "unprotect" else { throw StoreError.failed }
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard input.count <= 32768, let bytes = Data(base64Encoded: input) else { throw StoreError.failed }
    let key = try wrappingKey(create: mode == "protect")
    let output: Data
    if mode == "protect" {
        guard let sealed = try AES.GCM.seal(bytes, using: key).combined else { throw StoreError.failed }
        output = sealed
    } else {
        output = try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key)
    }
    FileHandle.standardOutput.write(output.base64EncodedData())
} catch { exit(1) }
