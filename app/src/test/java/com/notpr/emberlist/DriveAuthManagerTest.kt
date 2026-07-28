package com.notpr.emberlist

import com.notpr.emberlist.data.sync.DriveAuthManager
import com.notpr.emberlist.data.sync.driveAccountsMatch
import com.notpr.emberlist.data.sync.parseGoogleIdentity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
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
    fun authorizationUsesStableIdentityFromGoogleUserInfo() {
        val identity = parseGoogleIdentity(
            """{"sub":" google-account-id ","email":" person@example.com ","name":" Person "}"""
        )

        assertEquals("google-account-id", identity.accountId)
        assertEquals("person@example.com", identity.email)
        assertEquals("Person", identity.displayName)
    }

    @Test
    fun authorizationRejectsGoogleUserInfoWithoutStableSubject() {
        val error = assertThrows(java.io.IOException::class.java) {
            parseGoogleIdentity("""{"email":"person@example.com"}""")
        }

        assertTrue(error.message.orEmpty().contains("account identifier"))
    }

    @Test
    fun existingDriveBindingMatchesSameEmailDuringIdentifierMigration() {
        assertTrue(
            driveAccountsMatch(
                boundAccountId = "legacy-google-account-id",
                boundEmail = "Person@Example.com",
                authorizedAccountId = "stable-google-subject",
                authorizedEmail = "person@example.com"
            )
        )
        assertFalse(
            driveAccountsMatch(
                boundAccountId = "legacy-google-account-id",
                boundEmail = "person@example.com",
                authorizedAccountId = "other-stable-google-subject",
                authorizedEmail = "other@example.com"
            )
        )
    }
}
