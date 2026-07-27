package com.notpr.emberlist

import com.notpr.emberlist.data.sync.DriveAuthManager
import com.notpr.emberlist.data.sync.driveAccountsMatch
import com.notpr.emberlist.data.sync.resolveDriveAccountId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

    @Test
    fun authorizationUsesGoogleAccountIdWhenAvailable() {
        assertEquals(
            "google-account-id",
            resolveDriveAccountId("google-account-id", "person@example.com")
        )
    }

    @Test
    fun authorizationFallsBackToNormalizedEmailWhenGoogleAccountIdIsMissing() {
        assertEquals(
            "email:person@example.com",
            resolveDriveAccountId(null, " Person@Example.com ")
        )
        assertNull(resolveDriveAccountId(null, " "))
    }

    @Test
    fun existingDriveBindingMatchesSameEmailDuringIdentifierMigration() {
        assertTrue(
            driveAccountsMatch(
                boundAccountId = "legacy-google-account-id",
                boundEmail = "Person@Example.com",
                authorizedAccountId = "email:person@example.com",
                authorizedEmail = "person@example.com"
            )
        )
        assertFalse(
            driveAccountsMatch(
                boundAccountId = "legacy-google-account-id",
                boundEmail = "person@example.com",
                authorizedAccountId = "email:other@example.com",
                authorizedEmail = "other@example.com"
            )
        )
    }
}
