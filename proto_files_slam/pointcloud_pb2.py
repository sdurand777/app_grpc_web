# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# NO CHECKED-IN PROTOBUF GENCODE
# source: pointcloud.proto
# Protobuf Python Version: 5.27.2
"""Generated protocol buffer code."""
from google.protobuf import descriptor as _descriptor
from google.protobuf import descriptor_pool as _descriptor_pool
from google.protobuf import runtime_version as _runtime_version
from google.protobuf import symbol_database as _symbol_database
from google.protobuf.internal import builder as _builder
_runtime_version.ValidateProtobufRuntimeVersion(
    _runtime_version.Domain.PUBLIC,
    5,
    27,
    2,
    '',
    'pointcloud.proto'
)
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()


from google.protobuf import timestamp_pb2 as google_dot_protobuf_dot_timestamp__pb2
from google.protobuf import duration_pb2 as google_dot_protobuf_dot_duration__pb2


DESCRIPTOR = _descriptor_pool.Default().AddSerializedFile(b'\n\x10pointcloud.proto\x12\x08IVM.slam\x1a\x1fgoogle/protobuf/timestamp.proto\x1a\x1egoogle/protobuf/duration.proto\"\xba\x01\n\tDataChunk\x12\x10\n\x08\x63hunk_id\x18\x01 \x01(\t\x12\x17\n\x0fsequence_number\x18\x02 \x01(\x05\x12\x12\n\nsession_id\x18\x03 \x01(\t\x12\x11\n\ttimestamp\x18\x04 \x01(\x03\x12(\n\npointcloud\x18\x05 \x01(\x0b\x32\x14.IVM.slam.PointCloud\x12\x1c\n\x04pose\x18\x06 \x01(\x0b\x32\x0e.IVM.slam.Pose\x12\x13\n\x0bis_keyframe\x18\x07 \x01(\x08\"[\n\x0c\x43hunkRequest\x12\x12\n\nsession_id\x18\x01 \x01(\t\x12\x19\n\x11missing_chunk_ids\x18\x02 \x03(\t\x12\x1c\n\x14last_sequence_number\x18\x03 \x01(\x05\"s\n\nSyncStatus\x12\x12\n\nsession_id\x18\x01 \x01(\t\x12\x14\n\x0ctotal_chunks\x18\x02 \x01(\x05\x12\x1e\n\x16latest_sequence_number\x18\x03 \x01(\x05\x12\x1b\n\x13\x61vailable_chunk_ids\x18\x04 \x03(\t\"\xb1\x01\n\x08SlamData\x12\x30\n\x0epointcloudlist\x18\x01 \x01(\x0b\x32\x18.IVM.slam.PointCloudList\x12$\n\x08poselist\x18\x02 \x01(\x0b\x32\x12.IVM.slam.PoseList\x12\"\n\tindexlist\x18\x03 \x01(\x0b\x32\x0f.IVM.slam.Index\x12\x10\n\x08\x63hunk_id\x18\x04 \x01(\t\x12\x17\n\x0fsequence_number\x18\x05 \x01(\x05\"I\n\x05Point\x12\t\n\x01x\x18\x01 \x01(\x01\x12\t\n\x01y\x18\x02 \x01(\x01\x12\t\n\x01z\x18\x03 \x01(\x01\x12\t\n\x01r\x18\x04 \x01(\x01\x12\t\n\x01g\x18\x05 \x01(\x01\x12\t\n\x01\x62\x18\x06 \x01(\x01\"-\n\nPointCloud\x12\x1f\n\x06points\x18\x01 \x03(\x0b\x32\x0f.IVM.slam.Point\"\x16\n\x04Pose\x12\x0e\n\x06matrix\x18\x01 \x03(\x01\"\x16\n\x05Index\x12\r\n\x05index\x18\x01 \x03(\x05\";\n\x0ePointCloudList\x12)\n\x0bpointclouds\x18\x01 \x03(\x0b\x32\x14.IVM.slam.PointCloud\")\n\x08PoseList\x12\x1d\n\x05poses\x18\x01 \x03(\x0b\x32\x0e.IVM.slam.Pose\"\\\n\x12PointCloudWithPose\x12(\n\npointCloud\x18\x01 \x01(\x0b\x32\x14.IVM.slam.PointCloud\x12\x1c\n\x04pose\x18\x02 \x01(\x0b\x32\x0e.IVM.slam.Pose\"y\n\x0bSessionInfo\x12\x12\n\nsession_id\x18\x01 \x01(\t\x12\x12\n\nstart_time\x18\x02 \x01(\t\x12\x11\n\tis_active\x18\x03 \x01(\x08\x12\x19\n\x11\x63lients_connected\x18\x04 \x01(\x05\x12\x14\n\x0ctotal_chunks\x18\x05 \x01(\x05\x62\x06proto3')

_globals = globals()
_builder.BuildMessageAndEnumDescriptors(DESCRIPTOR, _globals)
_builder.BuildTopDescriptorsAndMessages(DESCRIPTOR, 'pointcloud_pb2', _globals)
if not _descriptor._USE_C_DESCRIPTORS:
  DESCRIPTOR._loaded_options = None
  _globals['_DATACHUNK']._serialized_start=96
  _globals['_DATACHUNK']._serialized_end=282
  _globals['_CHUNKREQUEST']._serialized_start=284
  _globals['_CHUNKREQUEST']._serialized_end=375
  _globals['_SYNCSTATUS']._serialized_start=377
  _globals['_SYNCSTATUS']._serialized_end=492
  _globals['_SLAMDATA']._serialized_start=495
  _globals['_SLAMDATA']._serialized_end=672
  _globals['_POINT']._serialized_start=674
  _globals['_POINT']._serialized_end=747
  _globals['_POINTCLOUD']._serialized_start=749
  _globals['_POINTCLOUD']._serialized_end=794
  _globals['_POSE']._serialized_start=796
  _globals['_POSE']._serialized_end=818
  _globals['_INDEX']._serialized_start=820
  _globals['_INDEX']._serialized_end=842
  _globals['_POINTCLOUDLIST']._serialized_start=844
  _globals['_POINTCLOUDLIST']._serialized_end=903
  _globals['_POSELIST']._serialized_start=905
  _globals['_POSELIST']._serialized_end=946
  _globals['_POINTCLOUDWITHPOSE']._serialized_start=948
  _globals['_POINTCLOUDWITHPOSE']._serialized_end=1040
  _globals['_SESSIONINFO']._serialized_start=1042
  _globals['_SESSIONINFO']._serialized_end=1163
# @@protoc_insertion_point(module_scope)
