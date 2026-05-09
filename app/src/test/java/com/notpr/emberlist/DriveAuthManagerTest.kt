package com.notpr.emberlist

import com.notpr.emberlist.data.sync.DriveAuthManager
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveAuthManagerTest {
    @Test
    fun code10SignInErrorExplainsReleaseShaRegistration() {
        val message = DriveAuthManager.googleSignInErrorMessage(10, null)

        assertTrue(message.contains("code 10"))
        assertTrue(message.contains("package name and signing certificate SHA-1"))
        assertTrue(message.contains("Google Cloud"))
    }

    @Test
    fun signInErrorIncludesStatusMessageWhenAvailable() {
        val message = DriveAuthManager.googleSignInErrorMessage(12501, "Canceled")

        assertTrue(message.contains("code 12501"))
        assertTrue(message.contains("Canceled"))
    }
}
