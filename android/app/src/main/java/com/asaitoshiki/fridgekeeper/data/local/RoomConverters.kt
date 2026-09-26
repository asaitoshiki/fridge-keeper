package com.asaitoshiki.fridgekeeper.data.local

import androidx.room.TypeConverter
import com.asaitoshiki.fridgekeeper.domain.model.ConsumptionType
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import java.time.LocalDate

/**
 * Room が扱えない型の相互変換。
 *
 * LocalDate は ISO-8601 文字列（yyyy-MM-dd）で保存する。
 * この形式は辞書順と日付順が一致するため、SQL 側で MIN/MAX や範囲比較がそのまま使える。
 * Enum は name() で保存する。序数だと定数の並び替えで既存データが壊れるため。
 */
class RoomConverters {

    @TypeConverter
    fun fromLocalDate(value: LocalDate?): String? = value?.toString()

    @TypeConverter
    fun toLocalDate(value: String?): LocalDate? = value?.let(LocalDate::parse)

    @TypeConverter
    fun fromFoodCategory(value: FoodCategory?): String? = value?.name

    @TypeConverter
    fun toFoodCategory(value: String?): FoodCategory? = value?.let(FoodCategory::valueOf)

    @TypeConverter
    fun fromStorageLocation(value: StorageLocation?): String? = value?.name

    @TypeConverter
    fun toStorageLocation(value: String?): StorageLocation? = value?.let(StorageLocation::valueOf)

    @TypeConverter
    fun fromExpiryType(value: ExpiryType?): String? = value?.name

    @TypeConverter
    fun toExpiryType(value: String?): ExpiryType? = value?.let(ExpiryType::valueOf)

    @TypeConverter
    fun fromConsumptionType(value: ConsumptionType?): String? = value?.name

    @TypeConverter
    fun toConsumptionType(value: String?): ConsumptionType? = value?.let(ConsumptionType::valueOf)
}
