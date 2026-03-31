package com.notpr.emberlist.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

fun observeNetworkConnectivity(context: Context): Flow<Boolean> = callbackFlow {
    val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    fun isConnected(): Boolean {
        val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
        return capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            trySend(true).isSuccess
        }

        override fun onLost(network: Network) {
            trySend(isConnected()).isSuccess
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            trySend(networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)).isSuccess
        }
    }

    trySend(isConnected()).isSuccess
    connectivityManager.registerDefaultNetworkCallback(callback)
    awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
}
