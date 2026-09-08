import AppKit

final class Installer: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var label: NSTextField!
    var installButton: NSButton!
    var process: Process?
    let folder = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Sulsul/runtime/extension")
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 540, height: 420), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "술술 · 연결 앱 설치"
        let title = NSTextField(labelWithString: "읽던 자리에서, 술술.")
        title.font = .systemFont(ofSize: 29, weight: .semibold)
        title.frame = NSRect(x: 35, y: 335, width: 470, height: 45)
        window.contentView!.addSubview(title)
        label = NSTextField(wrappingLabelWithString: "Chrome에서 번역할 수 있도록 이 Mac에 연결 앱을 설치합니다.\n\nChatGPT 첫 연결 때 공식 연결 프로그램을 다운로드합니다.")
        label.font = .systemFont(ofSize: 15)
        label.frame = NSRect(x: 35, y: 140, width: 470, height: 180)
        window.contentView!.addSubview(label)
        installButton = NSButton(title: "설치하기", target: self, action: #selector(install))
        installButton.bezelStyle = .rounded
        installButton.frame = NSRect(x: 30, y: 80, width: 145, height: 38)
        window.contentView!.addSubview(installButton)
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func install() {
        guard process == nil, let resources = Bundle.main.resourceURL else { return }
        installButton.isEnabled = false
        label.stringValue = "술술 연결 프로그램을 설치하고 있어요.\n잠시만 기다려 주세요."
        let payload = resources.appendingPathComponent("payload")
        let task = Process()
        task.executableURL = payload.appendingPathComponent("bin/node")
        task.arguments = [payload.appendingPathComponent("scripts/install-macos.mjs").path, "--bundled"]
        let pipe = Pipe()
        task.standardOutput = pipe; task.standardError = pipe
        // Drain output without exposing filesystem paths or a terminal window.
        pipe.fileHandleForReading.readabilityHandler = { handle in _ = handle.availableData }
        task.terminationHandler = { [weak self] task in
            DispatchQueue.main.async {
                pipe.fileHandleForReading.readabilityHandler = nil
                guard let self = self else { return }
                self.process = nil
                if task.terminationStatus == 0 { self.finished() }
                else {
                    self.label.stringValue = "설치를 완료하지 못했습니다.\n인터넷 연결과 저장 공간을 확인한 뒤 다시 설치해 주세요."
                    self.installButton.isEnabled = true
                }
            }
        }
        do { process = task; try task.run() }
        catch { process = nil; label.stringValue = "이 Mac에서 설치 앱을 실행하지 못했습니다. Mac 종류에 맞는 설치 파일을 다시 받아 주세요."; installButton.isEnabled = true }
    }
    func finished() {
        label.stringValue = "설치했어요. 이제 Chrome에 술술을 추가해 주세요.\n\n1. Chrome 주소창에 chrome://extensions 입력\n2. 개발자 모드 → 압축해제된 확장 프로그램 로드\n3. 폴더 선택 창에서 ⌘⇧G → 아래 버튼으로 복사한 경로 붙여넣기\n\n추가 후 술술의 ChatGPT 연결에서 공식 로그인하세요."
        installButton.title = "확장 폴더 열기"; installButton.action = #selector(reveal); installButton.isEnabled = true
        let copy = NSButton(title: "폴더 경로 복사", target: self, action: #selector(copyPath))
        copy.bezelStyle = .rounded; copy.frame = NSRect(x: 190, y: 80, width: 145, height: 38)
        window.contentView!.addSubview(copy)
    }
    @objc func reveal() { NSWorkspace.shared.activateFileViewerSelecting([folder]) }
    @objc func copyPath() { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(folder.path, forType: .string) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if process != nil {
            let alert = NSAlert(); alert.messageText = "설치가 진행 중이에요."; alert.informativeText = "설치가 끝날 때까지 이 창을 열어 두세요."; alert.runModal()
            return .terminateCancel
        }
        return .terminateNow
    }
}
let app = NSApplication.shared
let delegate = Installer()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
