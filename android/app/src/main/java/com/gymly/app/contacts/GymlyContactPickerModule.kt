package com.gymly.app.contacts

import android.app.Activity
import android.content.Intent
import android.provider.ContactsContract
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Opens the system contact picker for one contact the user chooses.
 * The result URI is the only row that is read, and only its name and number.
 * This module does not request address-book permission and does not scan contacts.
 */
class GymlyContactPickerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pending: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "GymlyContactPicker"

  @ReactMethod
  fun pickContacts(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No screen is available for the contact picker")
      return
    }
    if (pending != null) {
      promise.reject("BUSY", "Contact picker is already open")
      return
    }
    val intent = Intent(
      Intent.ACTION_PICK,
      ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
    )
    pending = promise
    try {
      activity.startActivityForResult(intent, REQUEST_PICK)
    } catch (error: Exception) {
      pending = null
      promise.reject("UNAVAILABLE", "Contact picker could not be opened", error)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != REQUEST_PICK) {
      return
    }
    val promise = pending ?: return
    pending = null
    if (resultCode != Activity.RESULT_OK || data?.data == null) {
      promise.resolve(cancelled())
      return
    }
    val uri = data.data ?: run {
      promise.resolve(cancelled())
      return
    }
    try {
      var name = ""
      var number = ""
      activity.contentResolver.query(
        uri,
        arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER,
        ),
        null,
        null,
        null,
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
          val numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
          if (nameIndex >= 0) {
            name = cursor.getString(nameIndex) ?: ""
          }
          if (numberIndex >= 0) {
            number = cursor.getString(numberIndex) ?: ""
          }
        }
      }
      val contacts = Arguments.createArray()
      val contact = Arguments.createMap()
      contact.putString("displayName", name)
      val phones = Arguments.createArray()
      if (number.isNotBlank()) {
        phones.pushString(number)
      }
      contact.putArray("phoneNumbers", phones)
      contacts.pushMap(contact)
      val result = Arguments.createMap()
      result.putBoolean("cancelled", false)
      result.putArray("contacts", contacts)
      promise.resolve(result)
    } catch (error: SecurityException) {
      promise.reject(
        "PICK_DENIED",
        "The selected contact could not be read without address-book access",
        error,
      )
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun cancelled() = Arguments.createMap().apply {
    putBoolean("cancelled", true)
    putArray("contacts", Arguments.createArray())
  }

  companion object {
    private const val REQUEST_PICK = 48121
  }
}
