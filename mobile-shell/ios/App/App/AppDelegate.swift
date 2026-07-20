import UIKit
import Capacitor
import WebKit

/**
 Bridge con el fondo del WebView atado al TEMA.

 El `backgroundColor` de capacitor.config.ts solo admite una cadena hexadecimal, o sea un
 color ESTÁTICO, y un color estático no puede seguir a la apariencia del sistema. Por eso
 fallaron los tres intentos por configuración, todos medidos con fotogramas: en crema
 destellaba al abrir en oscuro, en #15140F el problema se invertía en claro, y quitándolo
 el bridge cae a `UIColor.systemBackground` — dinámico, sí, pero NEGRO PURO en oscuro y no
 nuestro #15140F.

 `UIColor(named:)` devuelve un color dinámico que se resuelve solo en cada apariencia, y
 el color set ya existe: SplashBackground, el mismo que usa el launch screen, con sus dos
 variantes. Así el arranque queda de un solo color de punta a punta.

 Va en este fichero A PROPÓSITO, no en uno nuevo: solo AppDelegate.swift está registrado
 en project.pbxproj, que es el fichero de firma personal y no debe tocarse. Una clase más
 aquí se compila sin modificarlo.

 `webView` es `public fileprivate(set)`: no se puede REASIGNAR desde fuera del bridge,
 pero sí mutar sus propiedades, que es lo único que hace falta.
 */
class CarteraBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        aplicarFondoDelTema()
    }

    /// El color dinámico hay que reafirmarlo al cambiar de apariencia: el bridge fija el
    /// fondo una vez al construir el WebView, así que sin esto un cambio de tema con la
    /// app abierta dejaría el fondo anterior asomando en el rebote del scroll.
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
            aplicarFondoDelTema()
        }
    }

    private func aplicarFondoDelTema() {
        // Si el asset faltara, `UIColor(named:)` devuelve nil y se deja lo que ya había:
        // mejor el comportamiento anterior que un fondo transparente.
        guard let fondo = UIColor(named: "SplashBackground") else { return }
        view.backgroundColor = fondo
        webView?.backgroundColor = fondo
        webView?.scrollView.backgroundColor = fondo
        // isOpaque se deja como está: volverlo transparente deja ver lo que hay debajo
        // durante la carga y eso es cambiar un destello por otro.
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
