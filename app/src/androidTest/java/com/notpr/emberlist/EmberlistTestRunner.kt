package com.notpr.emberlist

import android.accounts.Account
import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.test.runner.AndroidJUnitRunner
import com.google.android.gms.auth.api.identity.AuthorizationClient
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.tasks.Tasks
import com.google.api.services.drive.DriveScopes
import com.notpr.emberlist.data.AppContainer
import com.notpr.emberlist.data.sync.DriveAppDataClient
import com.notpr.emberlist.data.sync.DriveFileRef
import com.notpr.emberlist.data.sync.SyncPayload
import java.lang.reflect.Proxy

class EmberlistTestRunner : AndroidJUnitRunner() {
    override fun newApplication(
        classLoader: ClassLoader,
        className: String,
        context: Context
    ): Application = super.newApplication(
        classLoader,
        EmberlistTestApp::class.java.name,
        context
    )
}

class EmberlistTestApp : EmberlistApp() {
    override fun createContainer(): AppContainer = AppContainer(
        context = this,
        authorizationClient = FakeGoogleDriveBackend.authorizationClient,
        driveClientFactory = { FakeGoogleDriveBackend }
    )
}

object FakeGoogleDriveBackend : DriveAppDataClient {
    const val EMAIL = "instrumentation@example.invalid"
    const val ACCOUNT_ID = "email:$EMAIL"
    const val REMOTE_TASK_ID = "instrumentation-drive-task"

    @Volatile
    var enabled: Boolean = false

    @Volatile
    var remotePayload: SyncPayload? = null

    val authorizationClient: AuthorizationClient = Proxy.newProxyInstance(
        AuthorizationClient::class.java.classLoader,
        arrayOf(AuthorizationClient::class.java)
    ) { _, method, _ ->
        when (method.name) {
            "authorize" -> if (enabled) {
                Tasks.forResult(successfulAuthorization())
            } else {
                Tasks.forException<AuthorizationResult>(
                    IllegalStateException("Fake Google authorization is disabled.")
                )
            }
            "getAuthorizationResultFromIntent" -> if (enabled) {
                successfulAuthorization()
            } else {
                throw IllegalStateException("Fake Google authorization is disabled.")
            }
            "revokeAccess", "clearToken" -> Tasks.forResult(null)
            "toString" -> "FakeGoogleDriveAuthorizationClient"
            "hashCode" -> System.identityHashCode(this)
            "equals" -> false
            else -> throw UnsupportedOperationException("Unexpected AuthorizationClient call: ${method.name}")
        }
    } as AuthorizationClient

    override suspend fun listSyncFiles(name: String): List<DriveFileRef> =
        if (remotePayload == null) emptyList() else listOf(DriveFileRef("instrumentation-drive-file", 1L))

    override suspend fun downloadPayload(fileId: String): SyncPayload? = remotePayload

    override suspend fun uploadPayload(
        name: String,
        payload: SyncPayload,
        existingFileId: String?
    ): String {
        remotePayload = payload
        return existingFileId ?: "instrumentation-drive-file"
    }

    fun reset() {
        enabled = false
        remotePayload = null
    }

    @Suppress("DEPRECATION")
    private fun successfulAuthorization(): AuthorizationResult {
        val account = GoogleSignInAccount.fromAccount(Account(EMAIL, "com.google"))
        check(account.id == null)
        return AuthorizationResult(
            null,
            "instrumentation-access-token",
            null,
            listOf(DriveScopes.DRIVE_APPDATA, "openid", "email", "profile"),
            account,
            null
        )
    }
}
