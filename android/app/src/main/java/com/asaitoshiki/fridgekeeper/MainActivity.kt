package com.asaitoshiki.fridgekeeper

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.asaitoshiki.fridgekeeper.ui.home.HomeScreen
import com.asaitoshiki.fridgekeeper.ui.theme.FridgeKeeperTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FridgeKeeperTheme {
                HomeScreen()
            }
        }
    }
}
