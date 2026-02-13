package com.notpr.emberlist.ui.screens

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.Slider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberMarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.widget.Autocomplete
import com.google.android.libraries.places.widget.model.AutocompleteActivityMode
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.data.model.LocationEntity
import com.notpr.emberlist.data.model.LocationTriggerType
import com.notpr.emberlist.ui.EmberlistViewModelFactory
import java.util.UUID

enum class LocationPickerMode { TASK, REMINDER }

@Composable
fun LocationPickerScreen(
    padding: PaddingValues,
    navController: NavHostController,
    taskId: String,
    mode: LocationPickerMode
) {
    val container = LocalAppContainer.current
    val viewModel: LocationPickerViewModel = viewModel(factory = EmberlistViewModelFactory(container))
    val task by viewModel.observeTask(taskId).collectAsState()
    val existingLocationId = task?.locationId
    val existingLocationFlow = remember(existingLocationId) {
        existingLocationId?.let { viewModel.observeLocation(it) }
    }
    val existingLocation by (existingLocationFlow?.collectAsState() ?: remember { mutableStateOf(null) })
    val context = LocalContext.current

    var label by remember(existingLocation?.label) { mutableStateOf(existingLocation?.label ?: "") }
    var address by remember(existingLocation?.address) { mutableStateOf(existingLocation?.address ?: "") }
    var radius by remember(existingLocation?.radiusMeters) { mutableStateOf(existingLocation?.radiusMeters?.toFloat() ?: 150f) }
    var triggerType by remember(existingLocation?.let { task?.locationTriggerType }) {
        mutableStateOf(task?.locationTriggerType ?: LocationTriggerType.ARRIVE)
    }
    var selectedLatLng by remember(existingLocation?.lat) {
        mutableStateOf(existingLocation?.let { LatLng(it.lat, it.lng) })
    }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(selectedLatLng ?: LatLng(37.7749, -122.4194), 13f)
    }

    val fields = listOf(Place.Field.ID, Place.Field.NAME, Place.Field.ADDRESS, Place.Field.LAT_LNG)
    val autocompleteLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val place = Autocomplete.getPlaceFromIntent(result.data!!)
            selectedLatLng = place.latLng
            label = place.name ?: label
            address = place.address ?: address
            place.latLng?.let { cameraPositionState.position = CameraPosition.fromLatLngZoom(it, 15f) }
        }
    }

    LaunchedEffect(Unit) {
        if (!Places.isInitialized()) {
            val key = com.notpr.emberlist.BuildConfig.MAPS_API_KEY
            if (key.isNotBlank()) {
                Places.initialize(context.applicationContext, key)
            }
        }
    }
    val placesReady = Places.isInitialized()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(text = "Pick Location", style = MaterialTheme.typography.headlineSmall)
        OutlinedButton(
            enabled = placesReady,
            onClick = {
                val intent = Autocomplete.IntentBuilder(AutocompleteActivityMode.OVERLAY, fields).build(context)
                autocompleteLauncher.launch(intent)
            }
        ) { Text("Search address") }
        if (!placesReady) {
            Text(
                text = "Maps API key missing. Set MAPS_API_KEY in local.properties.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
        }

        GoogleMap(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            cameraPositionState = cameraPositionState,
            onMapClick = { latLng -> selectedLatLng = latLng }
        ) {
            selectedLatLng?.let { Marker(state = rememberMarkerState(position = it)) }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { triggerType = LocationTriggerType.ARRIVE },
                modifier = Modifier.weight(1f)
            ) { Text("Arrive") }
            OutlinedButton(
                onClick = { triggerType = LocationTriggerType.LEAVE },
                modifier = Modifier.weight(1f)
            ) { Text("Leave") }
        }

        OutlinedTextField(
            value = label,
            onValueChange = { label = it },
            label = { Text("Label") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            label = { Text("Address") },
            modifier = Modifier.fillMaxWidth()
        )
        Text(text = "Radius: ${radius.toInt()}m")
        Slider(
            value = radius,
            onValueChange = { radius = it },
            valueRange = 50f..500f
        )

        Button(
            onClick = {
                val latLng = selectedLatLng ?: return@Button
                val location = LocationEntity(
                    id = UUID.randomUUID().toString(),
                    label = if (label.isBlank()) "Location" else label,
                    address = address,
                    lat = latLng.latitude,
                    lng = latLng.longitude,
                    radiusMeters = radius.toInt(),
                    createdAt = System.currentTimeMillis(),
                    updatedAt = System.currentTimeMillis()
                )
                when (mode) {
                    LocationPickerMode.TASK -> viewModel.setTaskLocation(taskId, location, triggerType)
                    LocationPickerMode.REMINDER -> viewModel.addLocationReminder(taskId, location, triggerType)
                }
                navController.popBackStack()
            },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Save location") }
    }
}
