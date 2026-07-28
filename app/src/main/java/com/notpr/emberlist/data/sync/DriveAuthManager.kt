package com.notpr.emberlist.data.sync

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.identity.AuthorizationClient
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.RevokeAccessRequest
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import com.google.api.services.drive.DriveScopes
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class DriveAuthState(
    val isSignedIn: Boolean = false,
    val hasDriveScope: Boolean = false,
    val accountId: String? = null,
    val email: String? = null,
    val displayName: String? = null,
    val requiresUserAction: Boolean = false
)

data class AuthorizedDriveAccess(
    val accountId: String,
    val email: String?,
    val displayName: String?,
    val accessToken: String
)

sealed interface DriveAuthorizationResult {
    data class Authorized(val access: AuthorizedDriveAccess) : DriveAuthorizationResult
    data class ResolutionRequired(val pendingIntent: PendingIntent) : DriveAuthorizationResult
    data class Failure(val message: String) : DriveAuthorizationResult
}

class DriveAuthManager(
    context: Context,
    private val client: AuthorizationClient = Identity.getAuthorizationClient(context)
) {
    private val driveScope = Scope(DriveScopes.DRIVE_APPDATA)
    private val identityScopes = listOf(Scope("openid"), Scope("email"), Scope("profile"))
    private val requestedScopes = listOf(driveScope) + identityScopes
    private val _state = MutableStateFlow(DriveAuthState())
    val state: StateFlow<DriveAuthState> = _state.asStateFlow()

    suspend fun authorize(selectAccount: Boolean = false): DriveAuthorizationResult {
        val request = AuthorizationRequest.builder()
            .setRequestedScopes(requestedScopes)
            .apply {
                if (selectAccount) setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
            }
            .build()
        val result = try {
            client.authorize(request).await()
        } catch (error: Throwable) {
            _state.value = _state.value.copy(hasDriveScope = false)
            return DriveAuthorizationResult.Failure(toAuthorizationError(error))
        }
        return consumeAuthorizationResult(result)
    }

    suspend fun handleAuthorizationResult(data: Intent?): DriveAuthorizationResult {
        if (data == null) return DriveAuthorizationResult.Failure("Google authorization was cancelled.")
        val result = try {
            client.getAuthorizationResultFromIntent(data)
        } catch (error: Throwable) {
            _state.value = _state.value.copy(hasDriveScope = false)
            return DriveAuthorizationResult.Failure(toAuthorizationError(error))
        }
        return consumeAuthorizationResult(result)
    }

    suspend fun disconnect(): DriveAuthState {
        val account = state.value.email?.let { android.accounts.Account(it, "com.google") }
        if (account != null) {
            client.revokeAccess(
                RevokeAccessRequest.builder()
                    .setAccount(account)
                    .setScopes(requestedScopes)
                    .build()
            ).await()
        }
        _state.value = DriveAuthState()
        return _state.value
    }

    private suspend fun consumeAuthorizationResult(
        result: AuthorizationResult
    ): DriveAuthorizationResult {
        if (result.hasResolution()) {
            val pendingIntent = result.pendingIntent
                ?: return DriveAuthorizationResult.Failure(
                    "Google authorization needs user action but did not provide a resolution."
                )
            _state.value = _state.value.copy(
                hasDriveScope = false,
                requiresUserAction = true
            )
            return DriveAuthorizationResult.ResolutionRequired(pendingIntent)
        }
        val token = result.accessToken
        val hasDriveScope = result.grantedScopes.contains(DriveScopes.DRIVE_APPDATA)
        if (!hasDriveScope) {
            _state.value = DriveAuthState()
            return DriveAuthorizationResult.Failure("Google Drive app-data access was not granted.")
        }
        if (token.isNullOrBlank()) {
            _state.value = DriveAuthState()
            return DriveAuthorizationResult.Failure(
                "Google authorization did not return a Drive access token."
            )
        }
        val identity = try {
            fetchGoogleIdentity(token)
        } catch (error: Throwable) {
            _state.value = DriveAuthState()
            return DriveAuthorizationResult.Failure(
                error.message ?: "Google account profile could not be verified."
            )
        }
        val access = AuthorizedDriveAccess(
            accountId = identity.accountId,
            email = identity.email,
            displayName = identity.displayName,
            accessToken = token
        )
        _state.value = DriveAuthState(
            isSignedIn = true,
            hasDriveScope = true,
            accountId = access.accountId,
            email = access.email,
            displayName = access.displayName,
            requiresUserAction = false
        )
        return DriveAuthorizationResult.Authorized(access)
    }

    private suspend fun fetchGoogleIdentity(accessToken: String): GoogleIdentity =
        withContext(Dispatchers.IO) {
            val connection = (URL(GOOGLE_USERINFO_ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 10_000
                readTimeout = 10_000
                setRequestProperty("Authorization", "Bearer $accessToken")
                setRequestProperty("Accept", "application/json")
            }
            try {
                val statusCode = connection.responseCode
                if (statusCode !in 200..299) {
                    throw IOException(
                        "Google account profile could not be verified (HTTP $statusCode)."
                    )
                }
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                parseGoogleIdentity(body)
            } finally {
                connection.disconnect()
            }
        }

    private fun toAuthorizationError(error: Throwable): String {
        val apiError = error as? ApiException
        return if (apiError != null) {
            googleSignInErrorMessage(apiError.statusCode, apiError.message)
        } else {
            error.message ?: "Google authorization failed."
        }
    }

    companion object {
        private const val GOOGLE_USERINFO_ENDPOINT =
            "https://www.googleapis.com/oauth2/v3/userinfo"

        internal fun googleSignInErrorMessage(statusCode: Int, statusMessage: String?): String = buildString {
            append("Google authorization failed")
            statusCode.takeIf { it != 0 }?.let { append(" (code ").append(it).append(')') }
            statusMessage?.takeIf { it.isNotBlank() }?.let { append(": ").append(it) }
            if (statusCode == 10) {
                append(". This usually means this APK's package name and signing certificate SHA-1 are not registered in Google Cloud.")
            }
        }
    }
}

internal data class GoogleIdentity(
    val accountId: String,
    val email: String?,
    val displayName: String?
)

internal fun parseGoogleIdentity(body: String): GoogleIdentity {
    val profile = Json.parseToJsonElement(body).jsonObject
    val accountId = profile["sub"]?.jsonPrimitive?.contentOrNull
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?: throw IOException("Google account profile did not return an account identifier.")
    return GoogleIdentity(
        accountId = accountId,
        email = profile["email"]?.jsonPrimitive?.contentOrNull
            ?.trim()
            ?.takeIf { it.isNotEmpty() },
        displayName = profile["name"]?.jsonPrimitive?.contentOrNull
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    )
}
