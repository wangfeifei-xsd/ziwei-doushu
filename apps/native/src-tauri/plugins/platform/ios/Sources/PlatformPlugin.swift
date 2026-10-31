import Tauri
import UIKit
import WebKit

struct ShareArgs: Decodable { let path: String; let mime: String }
struct NavigationArgs: Decodable { let intercept: Bool; let light: Bool }

class PlatformPlugin: Plugin {
    @objc public func navigation(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(NavigationArgs.self)
        DispatchQueue.main.async {
            self.manager.viewController?.overrideUserInterfaceStyle = args.light ? .light : .dark
            self.manager.viewController?.setNeedsStatusBarAppearanceUpdate()
            invoke.resolve()
        }
    }
    @objc public func share(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ShareArgs.self)
        DispatchQueue.main.async {
            guard let presenter = self.manager.viewController else { invoke.reject("系统分享暂不可用。"); return }
            let url = URL(fileURLWithPath: args.path)
            let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let popover = controller.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            controller.completionWithItemsHandler = { _, completed, _, error in
                if error != nil { invoke.reject("文件分享失败。"); return }
                invoke.resolve(["status": completed ? "shared" : "cancelled"])
            }
            presenter.present(controller, animated: true)
        }
    }
}
@_cdecl("init_plugin_platform")
public func initPlugin() -> Plugin { PlatformPlugin() }
