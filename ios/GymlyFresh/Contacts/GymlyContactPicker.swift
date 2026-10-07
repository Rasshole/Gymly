import Contacts
import ContactsUI
import UIKit

/// System contact picker. It does not request address-book permission and
/// does not enumerate contacts. Only the contact the user taps is returned,
/// and only the name and phone numbers needed to open a message.
@objc(GymlyContactPicker)
class GymlyContactPicker: NSObject, CNContactPickerDelegate {
  private var resolver: RCTPromiseResolveBlock?
  private var rejecter: RCTPromiseRejectBlock?

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc func pickContacts(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if self.resolver != nil {
        reject("BUSY", "Contact picker is already open", nil)
        return
      }
      guard let presenter = GymlyContactPicker.topViewController() else {
        reject("NO_VIEW", "No screen is available for the contact picker", nil)
        return
      }
      self.resolver = resolve
      self.rejecter = reject
      let picker = CNContactPickerViewController()
      picker.delegate = self
      picker.displayedPropertyKeys = [
        CNContactGivenNameKey,
        CNContactFamilyNameKey,
        CNContactPhoneNumbersKey,
      ]
      presenter.present(picker, animated: true)
    }
  }

  func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
    finish(cancelled: true, contacts: [])
  }

  func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
    let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
    let phones = contact.phoneNumbers.map { $0.value.stringValue }
    finish(cancelled: false, contacts: [["displayName": name, "phoneNumbers": phones]])
  }

  private func finish(cancelled: Bool, contacts: [[String: Any]]) {
    let resolve = resolver
    resolver = nil
    rejecter = nil
    resolve?(["cancelled": cancelled, "contacts": contacts])
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}
